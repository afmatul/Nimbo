# Plan 002 — Autenticación, sesiones y dispositivos

> Spec: `./spec.md` (Aclarada, 2026-09-26) · Estado del plan: **Aprobado** (architect, 2026-09-27, cambios aplicados)
>
> Base: plan 001 **Aprobado** (2026-09-27) y ADR-0017 (`@nestjs/jwt` + `@nestjs/passport` + `passport-jwt`, opción
> c.2), ADR-0018, ADR-0019 y ADR-0020 `Aceptado`. Este plan no redefine nada que entregue 001: reutiliza
> `IPasswordHasher`, `IUserRepository`, `IVerificationTokenRepository` (`token_cuenta`), `VerificationLinkIssuer`,
> `IMailer`, `ThrottlerModule`, `IRateLimiter`, `ITransactionRunner`, `IClock`, `ZodValidationPipe`,
> `TooManyRequestsError`, `OpaqueToken`, `EmailAddress`, `evaluatePassword` y `PasswordRequirements`.

## 1. Resumen técnico

Todo vive en `identity` (M1). `AuthController` suma `login` y las dos rutas de la cookie (`session/refresh`,
`session/logout`); un `PasswordController` nuevo atiende la recuperación y el cambio de contraseña, y
`SessionsController` lista y revoca sesiones (D-8). La lógica se reparte en tres servicios: `AuthService` (credenciales,
bloqueo por correo, D-5), `SessionService` (abrir, rotar, listar y revocar sesiones y dispositivos) y
`PasswordService` (recuperación D-6/D-15 y cambio D-7). El token de acceso es un JWT HS256 de 15 min con solo `sub`,
`rol`, `sid`, `iat` y `exp` (D-13), firmado y verificado por `JwtTokenService` (`ITokenService` del diagrama) con una
**única constante de opciones** (`ACCESS_TOKEN_OPTIONS`) que comparte la `JwtStrategy` de Passport (ADR-0017 c.2).
El puerto `IAccessTokenVerifier` (`I_ACCESS_TOKEN_VERIFIER`, `AccessTokenClaims`, `AccessTokenVerification` y
`ACCESS_TOKEN_STRATEGY = 'jwt'`) lo declara `shared` y **nace en 003-PR-A**; 002 lo implementa en `JwtTokenService`
(el verificador JWT del puerto, sobre `JwtService.verifyAsync`), el único que decide firma, algoritmo y vencimiento
con `IClock`. La `JwtStrategy` de `identity` (`ignoreExpiration: true`) solo delega en el puerto, y el `JwtAuthGuard` de
`shared` (003) extiende `AuthGuard(ACCESS_TOKEN_STRATEGY)`, crea el `Actor` y escribe `RequestPrincipal`; ni `shared`
ni `realtime` importan `identity` (D-14, ADR-0010, §6.7). El refresco es un token opaco
`<sid>.<secreto>` en una cookie `httpOnly`, `SameSite=Strict`, limitada a `/api/v1/auth/session`; la tabla `sesion`
guarda el hash del token vigente y el del anterior, así que presentar cualquier token viejo fuera de la gracia de 10 s
revoca la sesión (D-3). El dispositivo es un identificador aleatorio de 256 bits en otra cookie `httpOnly` de 1 año,
guardado como hash por cuenta en `dispositivo` (D-4, DF-11). El bloqueo por correo y el del cambio de contraseña usan
un puerto nuevo, `IAttemptLockout` → `RedisAttemptLockout` (Lua atómico, reloj de `IClock`); el límite por IP es un
segundo *throttler* con nombre (`login-ip`) cruzado con `@SkipThrottle` con el de registro. Dos migraciones crean
`dispositivo` y `sesion`. `web` agrega inicio de sesión, recuperar y restablecer (reutilizando los estados de 001), el
grupo de rutas con sesión, el menú de la cuenta y «Seguridad». El token de acceso vive solo en memoria (D-1). `worker`
y `notifications` no cambian: los cuatro correos nuevos son plantillas de `identity` que salen por `IMailer`.

## 2. Verificación contra la constitución

| Artículo | Cumple | Nota |
|---|---|---|
| I Spec manda | ☑ | Cada decisión cita su D-n o CA. Lo que la spec no fija está en §10.2 (DT-n) o §10.3 (preguntas). |
| IV SOLID | ☑ | S: `AuthService` (credenciales), `SessionService` (ciclo de vida de sesión y dispositivo), `PasswordService` (recuperar y cambiar); `JwtTokenService`, `RedisAttemptLockout` y los repositorios con una razón de cambio cada uno. I: `IAccessTokenVerifier` solo con `verify`; `ITokenService` solo con `issueAccessToken`; `IAttemptLockout` con `check`/`recordFailure`/`clear`. D: la aplicación depende de puertos; `@nestjs/jwt`, Passport, ioredis y TypeORM quedan en `infrastructure`. L: pruebas de contrato de `IAttemptLockout` (Redis real) y de `IAccessTokenVerifier` (la suite de contrato de 003, con su tramo por HTTP, corrida con el verificador real; ADR-0017 c.2). |
| V YAGNI — abstracciones nuevas | ☑ | `IAccessTokenVerifier` lo crea 003-PR-A (regla d: `shared`, 003 y `realtime` verifican sin depender de `identity`; además a: JWT); 002 solo lo implementa. `IAttemptLockout` (regla a: Redis). `IDeviceRepository` (regla b). `ISessionRepository` e `ITokenService` ya están en el diagrama. **No** se crean: tabla de historial de tokens de refresco (DT-1), puerto para el analizador de agente de usuario (función pura, DT-9), librería de cookies (DT-9), endpoint `/me` (DT-11), ni «revocar al suspender» para 011 (lo pide 011 cuando exista). |
| VI DRY | ☑ | Parámetros de §6 de la spec en `contracts/identity/parameters.ts` (los límites de recuperación **reutilizan** las constantes de 001, porque D-6 los iguala a D-8). Un `OpaqueToken` para refresco, dispositivo y recuperación. `VerificationLinkIssuer` para D-15. `evaluatePassword` y `PasswordRequirements` para restablecer y cambiar. Un solo guard por IP (`IdentityIpThrottlerGuard`, que ya nace así en 001; DT-8). Una sola constante de verificación del JWT (`ACCESS_TOKEN_OPTIONS`) y una sola verificación (el puerto; la estrategia delega). Una sola suite de contrato del puerto (la de 003). `SUPPORT_CONTACT_EMAIL` y `homePathFor` compartidos con 003. Un formateador de fecha de Guatemala en `identity/application/mail/` (tercer uso: aviso de intento de 001, dispositivo nuevo y contraseña cambiada; regla de tres). |
| VIII Fronteras | ☑ | Aristas: `identity → shared, notifications` (ya permitidas). `shared` declara `IAccessTokenVerifier` y `ACCESS_TOKEN_STRATEGY` y **no** importa `identity`; `IdentityModule` registra la `JwtStrategy` y exporta `I_ACCESS_TOKEN_VERIFIER`; el `JwtAuthGuard` de 003 encuentra la estrategia por su nombre (§6.8). Ninguna arista nueva entre módulos. |
| IX Seguridad — `actor`/`accessibleNodes` | ☑ | Listar/revocar sesiones y cambiar la contraseña reciben el `Actor` de 003 y filtran **en la consulta** por `usuario_id = actor.id` (no son nodos: `accessibleNodes` no aplica). Las rutas públicas (login, refresco, cierre, recuperación) no devuelven datos de cuentas ajenas. Tokens, dispositivos y enlaces solo como SHA-256 (R-3); contraseñas con Argon2id. |
| X Operabilidad | ☑ | Eventos de bitácora de §7 con `correlationId`, identificando la cuenta solo por `userId` (CA-25). Métricas: 022. |
| XI Integridad | ☑ | Rotación con la fila de `sesion` bloqueada (`FOR UPDATE`); consumo atómico del enlace de recuperación (el de 001); alta de dispositivo con `INSERT … ON CONFLICT … RETURNING`; correos después del commit con clave de idempotencia; los rechazos que revocan confirman la revocación **antes** de lanzar el error (§6.3). |
| XII Degradación | ☑ | SMTP caído: el inicio de sesión, el restablecimiento y el cambio responden igual y el `worker` reintenta. Si abrir la sesión al verificar falla, la cuenta queda verificada y se inicia sesión a mano (001 §6.11). Redis caído: el inicio de sesión falla cerrado (500), como los límites de 001 (§9). |

## 3. Coherencia con los diagramas

| Diagrama | Clases / tablas usadas | ¿Se aparta del diagrama? | Acción |
|---|---|---|---|
| Clases M1 | `AuthController` (login, refresh, forgotPassword, resetPassword), `SessionsController`, `AuthService`, `SessionService`, `ITokenService` → `JwtTokenService`, `ISessionRepository`, `IUserRepository`, `IPasswordHasher`, `Session`, `Device` | Sí: (1) `PasswordController` nuevo con `forgotPassword`, `checkResetLink`, `resetPassword` y `changePassword` (salen de `AuthController`, DT-15); (2) `AuthController.logout`; (3) `PasswordService` nuevo; (4) puertos nuevos `IDeviceRepository` e `IAttemptLockout` → `RedisAttemptLockout`; (5) objetos de valor `RefreshToken` y `UserAgentSummary`; (6) `Session` pierde `deviceFingerprint` e `ipAddress` (pasan a `Device`, DF-11); (7) `JwtStrategy` (Passport, ADR-0017; delega en el puerto); (8) `IdentityIpThrottlerGuard` (nace así en 001, DT-8; 002 agrega `login-ip`) | **DF-56** (provisional, §10.4); `design-model.md` M1 y redibujo en PD-07 |
| Clases T1 `shared` | `Actor`, `Role`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `TooManyRequestsError`, `configureHttpApp`; puerto `IAccessTokenVerifier` (`I_ACCESS_TOKEN_VERIFIER`, `AccessTokenClaims`, `AccessTokenVerification`, `ACCESS_TOKEN_STRATEGY`), `JwtAuthGuard`, `@CurrentActor()`, `@CurrentSessionId()` | Las piezas de `shared` las crea 003-PR-A (003 D-2); 002 no agrega nada a T1 salvo que su implementación la da `identity` | DF-55 de 003 cubre T1; DF-56 (provisional) solo anota la implementación en M1 |
| E-R usuarios | `usuario`, `token_cuenta` (sin cambios), `dispositivo`, `sesion` | Sí, contrastado con `Diagramas_ER.pdf` (`SESION(id, refresh_hash, creada_en, expira_en, revocada_en)`, `DISPOSITIVO(id, nombre, ultimo_acceso)`): se usan los nombres del E-R; se agregan `sesion.refresh_anterior_hash`, `rotado_en`, `ultimo_uso` (D-2, D-3) y `sesion.usuario_id` (con FK compuesta al dueño del dispositivo); `dispositivo` agrega `huella_hash`, `agente_usuario`, `ultima_ip` (DF-11, `Aceptado`) y **no** crea `nombre` (se deriva de `agente_usuario`) | E-R en PD-07; las diferencias en **DF-57** (provisional, §10.4) |
| Arquitectura §3 / §5 / §6 | `identity → shared, notifications`; puerto token→`Actor` de `shared` implementado por `identity` | No se aparta: es lo que ya dicen ADR-0010, 003 D-2 y `architecture.md` §5 | El nombre del puerto en `architecture.md` §5 lo pone 003 (Q-1 resuelta) |

Hallazgos `DF-xx`:

- **DF-11** (`Aceptado`, D-4): este plan lo aplica (§4). Pasa a `Resuelto` con el redibujo (PD-07).
- **DF-15** (parte de sesiones, D-8): `SessionsController` (§6.5). La parte de auditoría es de 004.
- **DF-19** (`Abierto`): `ISessionRepository` de M1 conserva su nombre; el renombre a `IEditSessionRepository` es de
  M5 (016). No bloquea.
- **DF-50** (guards en `shared`, 003): 002 **no** crea guards globales, `@Public()`, `@Roles()`, `@CurrentActor()`,
  `@CurrentSessionId()` ni el puerto; los usa (§3b, frontera con 003).
- **DF-54** (`Aceptado`): se amplía con DF-56 en lugar de reabrirlo.
- **DF-56** (clases M1/T1) y **DF-57** (columnas E-R de `sesion` y `dispositivo`): nuevos y **provisionales** (003
  conserva DF-55); se renumeran al integrar y los registra el `architect` (§10.4).

## 3b. Módulos afectados

| Módulo | Cambio | Capa(s) |
|---|---|---|
| `identity` | Dominio: `Session`, `Device`, `RefreshToken`, `UserAgentSummary`, errores nuevos. Aplicación: `AuthService`, `SessionService`, `PasswordService`, puertos `ISessionRepository`, `IDeviceRepository`, `ITokenService`, `IAttemptLockout`, cuatro plantillas de correo y el formateador de fecha. Infraestructura: `TypeOrmSessionRepository`, `TypeOrmDeviceRepository`, `JwtTokenService`, `JwtStrategy`, `RedisAttemptLockout`, `ACCESS_TOKEN_OPTIONS`. Presentación: `AuthController` (+ login, refresh, logout; `verifyEmail` abre sesión), `PasswordController`, `SessionsController`, `SessionCookies`, `readClientContext`, `IdentityIpThrottlerGuard` | todas |
| `shared` | Nada del puerto ni de los guards (los crea 003-PR-A). `configureHttpApp`: CORS con `credentials: true`, cabecera `authorization` y método `DELETE`; `REDACTED_FIELDS` + `currentPassword`, `newPassword`; `SECRET_KEYS` + `JWT_ACCESS_SECRET`; esquema de entorno | application, infrastructure, presentation |
| `packages/contracts` | `identity/`: esquemas de login, refresco, recuperación, restablecimiento, cambio de contraseña y sesiones; `verifyEmailResponseSchema` extendido; códigos de error nuevos; parámetros de §6; `SUPPORT_CONTACT_EMAIL` en `legal.ts` (mensaje de cuenta suspendida) | contratos |
| composición | `AppModule`: `login-ip` en `ThrottlerModule.forRoot`. Sigue importando `IdentityModule`; los guards globales (`AuthGuardsModule`, estático) ya los activa 003-PR-A. Sin módulo de composición propio | composición |
| `apps/web` | `(public)/iniciar-sesion`, `(public)/recuperar-contrasena`, `(public)/restablecer-contrasena`; grupo exterior `(app)` con `SessionProvider` y `SessionGate`, dentro del cual van `(cliente)` e `(interno)` de 003; `(app)/cuenta/seguridad` (los cuatro roles); `homePathFor(role)` de 003; `AccountMenu` y `ConfirmDestructiveDialog` en `components/nimbo`; `features/identity/session/` | presentación |
| `.env.example`, `scripts/check-env-example.ts` | `JWT_ACCESS_SECRET` (valor de desarrollo) | operación |
| `notifications`, `worker` | **sin cambios** | — |

Dependencias nuevas entre módulos: **ninguna**. `identity` sigue dependiendo solo de `shared` y `notifications`.

**Frontera con 003** (003 D-2, D-6, D-9, D-10; no se duplica nada):

| Pieza | Dueña | Qué hace 002 |
|---|---|---|
| Puerto token→`Actor` (`I_ACCESS_TOKEN_VERIFIER`, `AccessTokenClaims`, `AccessTokenVerification`, `ACCESS_TOKEN_STRATEGY`) | `shared`; **nace en 003-PR-A** con el verificador falso y la suite de contrato `apps/api/test/support/access-token-verifier.contract.ts` | Lo implementa (`JwtTokenService`), registra la `JwtStrategy` que delega en él y exporta `I_ACCESS_TOKEN_VERIFIER` desde `IdentityModule` (002-PR-2) |
| `JwtAuthGuard` (`extends AuthGuard(ACCESS_TOKEN_STRATEGY)`; `handleRequest` crea el `Actor` y escribe `RequestPrincipal`), `RolesGuard`, `@Public()`, `@Roles()`, `@CurrentActor()`, `@CurrentSessionId()`, `SHARED_UNAUTHENTICATED`/`SHARED_FORBIDDEN`; `AuthGuardsModule` estático activo en `AppModule` | 003-PR-A | Las rutas públicas de 002 llevan `@Public()` desde 002-PR-2 (los guards ya están activos). `SessionsController` y `changePassword` usan `@CurrentActor()` y `@CurrentSessionId()` (PR-4). Nadie lee `req.user` |
| Dependencias de autenticación (`@nestjs/passport`, `passport`, `passport-jwt`, `@nestjs/jwt`, `@types/passport-jwt`) | 003-PR-A las instala todas (ADR-0017) | Ninguna instalación |
| Tokens reales en el arnés de aislamiento de 003 y la suite de contrato de 003 (tramo del puerto y tramo HTTP) con el verificador real | 002 | 002-PR-2 |
| `withActor()`, roles de BD (`nimbo_app`), RLS | 003 | No lo usa (no es contenido, ADR-0005). Los privilegios por defecto de 003 (con `DELETE`, 003 DT-11) ya cubren `dispositivo` y `sesion`, porque sus migraciones son posteriores a `20260928110000` |
| Handshake de Socket.IO | 015 | Nada: usará `I_ACCESS_TOKEN_VERIFIER` |

## 4. Modelo de datos

Dos migraciones escritas a mano (ADR-0002) en `apps/api/src/migrations/`, posteriores a las de 001:

```sql
-- 20260929100000-crear-dispositivo.ts  (up)
CREATE TABLE dispositivo (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id      uuid         NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
  huella_hash     char(64)     NOT NULL,          -- SHA-256 hex del identificador de la cookie (D-4, R-3)
  agente_usuario  varchar(512) NOT NULL DEFAULT '',-- truncado a 512 al guardar; se muestra resumido (D-9)
  ultima_ip       inet         NULL,              -- solo seguridad; nunca se muestra (D-9, spec §10)
  ultimo_acceso   timestamptz  NOT NULL,
  CONSTRAINT ck_dispositivo_huella_hash CHECK (huella_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT uq_dispositivo_id_usuario_id UNIQUE (id, usuario_id)   -- destino de la FK compuesta de sesion
);
-- Sin «nombre» (E-R): el nombre visible se deriva de agente_usuario al leer (UserAgentSummary). Sin «creado_en».
CREATE UNIQUE INDEX uq_dispositivo_usuario_id_huella_hash ON dispositivo (usuario_id, huella_hash); -- D-4: «nuevo para esa cuenta»
-- down
DROP TABLE dispositivo;
```

```sql
-- 20260929100100-crear-sesion.ts  (up)
CREATE TABLE sesion (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id            uuid        NOT NULL,   -- agregado al E-R: filtro por dueño sin JOIN (Art. IX), DF-57
  dispositivo_id        uuid        NOT NULL,
  refresh_hash          char(64)    NOT NULL,   -- SHA-256 del secreto vigente del token de refresco (R-3)
  refresh_anterior_hash char(64)    NULL,       -- agregado: el secreto justo anterior, gracia de rotación (D-3, RN-4)
  rotado_en             timestamptz NULL,       -- agregado: cuándo se rotó por última vez
  creada_en             timestamptz NOT NULL,
  ultimo_uso            timestamptz NOT NULL,   -- agregado: última renovación; vence tras 7 días sin uso (D-2)
  expira_en             timestamptz NOT NULL,   -- creada_en + 30 días (D-2)
  revocada_en           timestamptz NULL,
  CONSTRAINT fk_sesion_dispositivo_usuario FOREIGN KEY (dispositivo_id, usuario_id)
    REFERENCES dispositivo (id, usuario_id) ON DELETE CASCADE,  -- la sesión y su dispositivo son del mismo usuario
  CONSTRAINT ck_sesion_refresh_hash          CHECK (refresh_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_sesion_refresh_anterior_hash CHECK (refresh_anterior_hash IS NULL OR refresh_anterior_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_sesion_rotacion              CHECK ((refresh_anterior_hash IS NULL) = (rotado_en IS NULL)),
  CONSTRAINT ck_sesion_vigencia              CHECK (expira_en > creada_en AND ultimo_uso >= creada_en)
);
CREATE INDEX idx_sesion_usuario_id_ultimo_uso ON sesion (usuario_id, ultimo_uso DESC)
  WHERE revocada_en IS NULL;                                                   -- lista (CA-11) y revocar todas/las demás
CREATE INDEX idx_sesion_dispositivo_id_usuario_id ON sesion (dispositivo_id, usuario_id); -- FK compuesta y cascada
-- down
DROP TABLE sesion;
```

- **Búsqueda del refresco por `id`, no por hash**: el token lleva el `sid` (DT-1), así que la fila se lee por clave
  primaria con `FOR UPDATE` y el hash se compara en tiempo constante. No hace falta índice sobre `refresh_hash`.
- **Nombres y agregados al E-R** (`Diagramas_ER.pdf`, DF-57 provisional): `refresh_hash`, `creada_en`, `expira_en`,
  `revocada_en` y `dispositivo.ultimo_acceso` son del E-R. Se agregan `refresh_anterior_hash`, `rotado_en` y
  `ultimo_uso` (D-2, D-3) y `sesion.usuario_id` (el E-R cuelga la sesión solo del dispositivo). `usuario_id` se
  conserva para filtrar por dueño en la consulta sin `JOIN` (Art. IX), y la FK compuesta
  `(dispositivo_id, usuario_id) → dispositivo (id, usuario_id)` garantiza que coincide con el dueño del dispositivo.
  `dispositivo.nombre` del E-R **no** se crea: se deriva de `agente_usuario` al leer (guardarlo duplicaría el dato).
- **Sesión vigente** = `revocada_en IS NULL AND expira_en > $now AND ultimo_uso > $now - 7 días`. El vencimiento por
  inactividad no se guarda: se calcula con `ultimo_uso`, que es lo único que cambia al renovar.
- **Sin columna de motivo de revocación**: el motivo va a la bitácora (CA-25); ninguna regla lo lee de la BD (YAGNI).
  011 lo agrega si su auditoría lo necesita.
- **`dispositivo` por cuenta**: el mismo navegador usado por dos cuentas tiene dos filas con el mismo hash. Es
  correcto: D-4 define «nuevo» por cuenta, y el hash no revela nada.
- **Fechas**: todas las escribe la aplicación con `IClock` (como 001), para que `FixedClock` controle D-2, D-3 y D-5.
- **Tipos**: `inet` para la IP (`design-model.md` §5 no la fija; `inet` valida el formato); `char(64)` + `CHECK` hex
  para hashes, igual que `token_cuenta`.
- **`token_cuenta`**: sin cambios. El `CHECK` de 001 ya admite `tipo = 'recuperacion'` y el índice parcial
  `uq_token_cuenta_vigente` garantiza un solo enlace de recuperación vigente por cuenta (D-6: «pedir otro invalida los
  anteriores»).
- **RLS**: ninguna. ADR-0005 la limita a `archivo`, `version_archivo` y `fragmento`. Permisos de `nimbo_app`: las
  migraciones de 002 son posteriores a `20260928110000`, así que los privilegios por defecto que crea 003 (con
  `DELETE`, 003 DT-11) ya cubren `dispositivo` y `sesion`; no se pide nada a PD-39. El `DELETE` se conserva porque la
  purga de sesiones lo necesitará.
- **Crecimiento**: una fila de `sesion` por inicio de sesión, que no se borra. Volumen de Fase 1–4 despreciable; la
  purga de sesiones vencidas hace más de N días queda en **PD-45** (provisional; sin fecha, no bloquea).
- **Reversible**: cada `down` borra su tabla; `sesion` se revierte primero (LIFO). `run → revert → run` en local y en
  el job `migrations` de CI cuando exista (000 CA-11). `synchronize: false` sigue literal.

## 5. Contratos

### HTTP

Prefijo `/api/v1`. Todas las respuestas llevan `Cache-Control: no-store`. Solo JSON (`configureHttpApp` de 001).
Las rutas públicas llevan `@Public()` de 003 (los guards globales ya están activos desde 003-PR-A). «Cookie de refresco» = `nimbo_rt`; «cookie de
dispositivo» = `nimbo_did` (§6.5).

| Método | Ruta | Rol | Request (`packages/contracts`) | Respuesta | Errores |
|---|---|---|---|---|---|
| POST | `/auth/login` | público | `LoginRequest` `{ email, password }`, estricto; cookie de dispositivo opcional | `200` `SessionResponse` + `Set-Cookie` refresco (y dispositivo) | `422 IDENTITY_INVALID_INPUT`, `401 IDENTITY_INVALID_CREDENTIALS`, `403 IDENTITY_EMAIL_NOT_VERIFIED`, `403 IDENTITY_ACCOUNT_SUSPENDED`, `429 IDENTITY_LOGIN_LOCKED` (+ `Retry-After`), `429 IDENTITY_TOO_MANY_REQUESTS` (IP, + `Retry-After`) |
| POST | `/auth/session/refresh` | público (cookie) | sin cuerpo; cookie de refresco | `200` `SessionResponse` + `Set-Cookie` refresco rotado | `401 IDENTITY_REFRESH_INVALID` (sin cookie, mal formada, desconocida o dentro de la gracia; **no** borra la cookie), `401 IDENTITY_SESSION_EXPIRED` (borra), `401 IDENTITY_SESSION_REVOKED` (revocada, reúso o cuenta suspendida; borra) |
| POST | `/auth/session/logout` | público (cookie) | sin cuerpo; cookie de refresco | `204`; borra la cookie de refresco y conserva la de dispositivo | ninguno propio (idempotente: cookie ausente o inválida también da `204`) |
| POST | `/auth/verify-email` (001) | público | `VerifyEmailRequest` (sin cambios) | `200` `{ status: 'verified', session?: SessionResponse }` + cookies **solo** en la apertura que verifica; `{ status: 'already-verified' }` sin cookies | los de 001 |
| POST | `/auth/forgot-password` | público | `ForgotPasswordRequest` `{ email }`, estricto | `202` `AcceptedResponse` (el de 001) | `422 IDENTITY_INVALID_INPUT`, `429 IDENTITY_TOO_MANY_REQUESTS` (+ `Retry-After`) |
| POST | `/auth/reset-password/check` | público | `ResetTokenRequest` `{ token }` | `200` `{ status: 'valid' }` (no consume) | `422 IDENTITY_RESET_LINK_EXPIRED`, `422 IDENTITY_RESET_LINK_INVALID` |
| POST | `/auth/reset-password` | público | `ResetPasswordRequest` `{ token, password }`, estricto | `200` `{ status: 'password-reset' }`; borra la cookie de refresco de ese navegador; no crea sesión | `422 IDENTITY_RESET_LINK_EXPIRED`, `422 IDENTITY_RESET_LINK_INVALID`, `422 IDENTITY_WEAK_PASSWORD` (+ `fields`) |
| POST | `/auth/change-password` | CLIENT, ADMIN, SUPPORT, OPERATOR | `ChangePasswordRequest` `{ currentPassword, newPassword }`, estricto (la confirmación solo existe en el cliente, D-7) | `204` | `401 SHARED_UNAUTHENTICATED` (003), `422 IDENTITY_WRONG_PASSWORD` (+ `fields: currentPassword`), `422 IDENTITY_WEAK_PASSWORD`, `429 IDENTITY_PASSWORD_CHANGE_LOCKED` (+ `Retry-After`) |
| GET | `/sessions` | CLIENT, ADMIN, SUPPORT, OPERATOR | — | `200` `SessionListResponse` | `401 SHARED_UNAUTHENTICATED` |
| DELETE | `/sessions/:id` | CLIENT, ADMIN, SUPPORT, OPERATOR | `id` uuid | `204`; si es la sesión actual, además borra la cookie de refresco | `404 IDENTITY_SESSION_NOT_FOUND` (ajena, inexistente, ya revocada o `id` mal formado: idéntico, 003 D-6) |
| POST | `/sessions/revoke-others` | CLIENT, ADMIN, SUPPORT, OPERATOR | sin cuerpo | `200` `{ revokedCount: number }` (CA-13) | `401 SHARED_UNAUTHENTICATED` |

Tipos de respuesta (`contracts/identity/schemas.ts`):

- `SessionResponse` = `{ accessToken: string; accessTokenExpiresAt: string (ISO-8601 UTC); user: { id, fullName,
  email, role } }`. El `user` evita un `/me` (DT-11): la web lo necesita para el menú de la cuenta y para elegir el
  destino tras iniciar sesión. El correo va en el **cuerpo** para su dueño, nunca en el token (D-13). Cumple el pedido
  de 003 (`{ id, fullName, role }`; 003 usa `fullName`, no `name`).
- `SessionListResponse` = `{ items: SessionSummary[] }`, con `SessionSummary` = `{ id, browser, os, deviceKind:
  'desktop' | 'mobile' | 'tablet', startedAt, lastActiveAt, current: boolean }`. Actual primero y después por
  `lastActiveAt` descendente; como máximo 50 (DT-13). **Sin** IP, agente de usuario completo, hashes, `dispositivo.id`
  ni tokens (CA-11). `deviceKind` solo elige el ícono decorativo del mockup.
- `RevokeOthersResponse` = `{ revokedCount }`.

Códigos de error nuevos (`contracts/identity/error-codes.ts`; clases en `identity/domain/errors/`). El `status` lo fija
la clase base de `shared` (DT-14):

| `code` | HTTP | Clase base | Mensaje (español, con acción) | CA |
|---|---|---|---|---|
| `IDENTITY_INVALID_CREDENTIALS` | 401 | `UnauthorizedError` | «El correo o la contraseña no son correctos. Revísalos o restablece tu contraseña.» | CA-2 |
| `IDENTITY_EMAIL_NOT_VERIFIED` | 403 | `ForbiddenError` | el de CA-16 de 001 | CA-3 |
| `IDENTITY_ACCOUNT_SUSPENDED` | 403 | `ForbiddenError` | «Tu cuenta está suspendida. Si crees que es un error, escríbenos a {SUPPORT_CONTACT_EMAIL}.» | CA-4 |
| `IDENTITY_LOGIN_LOCKED` | 429 | `TooManyRequestsError` | «Hubo demasiados intentos fallidos. Espera {N} minutos o restablece tu contraseña.» (N = `ceil(retryAfter/60)`) | CA-5 |
| `IDENTITY_TOO_MANY_REQUESTS` (001) | 429 | `TooManyRequestsError` | por ámbito (DT-20): IP de inicio de sesión → «Hiciste demasiados intentos. Espera unos minutos y vuelve a intentarlo.»; recuperación → el de 001 («Ya te enviamos un enlace hace poco…») | CA-6, CA-18 |
| `IDENTITY_REFRESH_INVALID` | 401 | `UnauthorizedError` | «Tu sesión no es válida. Inicia sesión de nuevo.» (propuesto, Q-2) | CA-9 |
| `IDENTITY_SESSION_EXPIRED` | 401 | `UnauthorizedError` | «Tu sesión terminó. Inicia sesión de nuevo.» | CA-8 |
| `IDENTITY_SESSION_REVOKED` | 401 | `UnauthorizedError` | «Tu sesión se cerró. Inicia sesión de nuevo.» (propuesto, Q-2) | CA-9, CA-10 |
| `IDENTITY_SESSION_NOT_FOUND` | 404 | `NotFoundError` | «No encontramos esa sesión. Actualiza la lista.» (propuesto, Q-2) | CA-12 |
| `IDENTITY_RESET_LINK_EXPIRED` | 422 | `InvalidInputError` | «Este enlace venció. Pide uno nuevo y úsalo en la próxima hora.» | CA-20 |
| `IDENTITY_RESET_LINK_INVALID` | 422 | `InvalidInputError` | «Este enlace no es válido. Usa el enlace del correo más reciente o pide uno nuevo.» | CA-20 |
| `IDENTITY_WEAK_PASSWORD` (001) | 422 | `InvalidInputError` | el de 001, con `fields` | CA-21, CA-22 |
| `IDENTITY_WRONG_PASSWORD` | 422 | `InvalidInputError` | «La contraseña actual no es correcta.» + `fields: [{ field: 'currentPassword', reason: 'WRONG_PASSWORD' }]` | CA-23 |
| `IDENTITY_PASSWORD_CHANGE_LOCKED` | 429 | `TooManyRequestsError` | «Hiciste demasiados intentos con una contraseña incorrecta. Espera {N} minutos o restablece tu contraseña.» | CA-23 |

- **Respuesta neutra** (spec §7): en `login`, para correo inexistente y contraseña incorrecta, mismo `401`, mismo
  cuerpo y mismas cabeceras (sin `Set-Cookie` en ningún fallo; el *throttler* sin `X-RateLimit-*`, como 001). El
  bloqueo se consulta **antes** de buscar la cuenta, así `IDENTITY_LOGIN_LOCKED` es idéntico exista o no (CA-5). En
  `forgot-password` las cuatro clases de cuenta dan `202` idéntico y los límites se aplican antes de buscar (CA-18).
- **`401` en rutas públicas de `identity`**: la web solo intenta renovar ante `SHARED_UNAUTHENTICATED` (003 D-6), nunca
  ante un `IDENTITY_*`, así un `IDENTITY_INVALID_CREDENTIALS` no dispara un refresco.
- **`reason` nuevo**: `WRONG_PASSWORD` se agrega al conjunto cerrado de `contracts/identity/error-codes.ts`.
- **Token de recuperación mal formado**: `IDENTITY_RESET_LINK_INVALID`, igual que 001 con el de verificación.

Archivos de contrato de `identity` (solo se agregan; los de 001 no cambian salvo lo indicado):

| Archivo | Cambio |
|---|---|
| `schemas.ts` | + `loginRequestSchema`, `sessionResponseSchema`, `forgotPasswordRequestSchema`, `resetTokenRequestSchema`, `resetPasswordRequestSchema` (política D-6 de 001 sin la regla del correo, que el servicio completa), `changePasswordRequestSchema`, `sessionSummarySchema`, `sessionListResponseSchema`, `revokeOthersResponseSchema`; `verifyEmailResponseSchema` gana `session?` (aditivo) |
| `parameters.ts` | + `ACCESS_TOKEN_TTL_SECONDS = 900`, `SESSION_IDLE_TIMEOUT_DAYS = 7`, `SESSION_MAX_LIFETIME_DAYS = 30`, `REFRESH_ROTATION_GRACE_SECONDS = 10`, `LOGIN_MAX_FAILURES = 5`, `LOGIN_FAILURE_WINDOW_MINUTES = 15`, `LOGIN_LOCK_MINUTES = 15`, `LOGIN_ATTEMPTS_PER_IP = 20`, `LOGIN_IP_WINDOW_MINUTES = 15`, `RESET_LINK_TTL_MINUTES = 60`, `PASSWORD_CHANGE_MAX_FAILURES = 5`, `PASSWORD_CHANGE_WINDOW_MINUTES = 15`, `PASSWORD_CHANGE_LOCK_MINUTES = 15`, `DEVICE_COOKIE_MAX_AGE_DAYS = 365`. La recuperación reutiliza `EMAIL_REQUEST_COOLDOWN_SECONDS` y `EMAIL_REQUESTS_PER_HOUR` de 001 |
| `error-codes.ts` | + los códigos de la tabla y el `reason` `WRONG_PASSWORD` |
| `legal.ts` | + `SUPPORT_CONTACT_EMAIL` (si 001 no la exportó ya): el mismo correo de §6.13 de 001, **única** constante de correo de contacto para las páginas legales, el mensaje de cuenta suspendida y 003 (que la usa en lugar de `CONTACT_EMAIL` en `lib/contact.ts`) |

### Eventos

| Evento | Productor | Consumidores | Payload |
|---|---|---|---|
| Cola `mail`, trabajo `send` (ADR-0018, sin cambios) | `PasswordService`, `SessionService` vía `IMailer` | `MailProcessor` (`worker`) | `MailMessage` con `idempotencyKey` sin `:`: `identity.password-reset.<id del token>`, `identity.new-device.<id de la sesión>`, `identity.password-changed.<uuid>`, `identity.session-revoked.<id de la sesión>` (una revocación por reúso por sesión, así que la clave es natural) |

No se publica ningún evento de dominio nuevo. «Cuenta suspendida → revocar sesiones» (D-10) lo hará 011 llamando a
`identity` cuando exista su spec.

### Tiempo real

Ninguno. 015 usará `I_ACCESS_TOKEN_VERIFIER` en el handshake.

## 6. Diseño de componentes

### 6.1 Estructura de `identity` (solo lo nuevo o modificado)

```
apps/api/src/modules/identity/
├─ domain/
│  ├─ session.entity.ts             # Session: open(), stateAt(now, idle), matchSecret(hash, now, grace), rotate(), revoke()
│  ├─ device.entity.ts              # Device: register(), seen()
│  ├─ refresh-token.vo.ts           # RefreshToken: issue(sessionId) → valor `<sid>.<secreto>`; parse(valor); secretHash
│  ├─ user-agent-summary.vo.ts      # UserAgentSummary.parse(ua) → { browser, os, deviceKind } (función pura, DT-9)
│  └─ errors/                       # InvalidCredentialsError, EmailNotVerifiedError, AccountSuspendedError, LoginLockedError,
│                                   # RefreshInvalidError, SessionExpiredError, SessionRevokedError, SessionNotFoundError,
│                                   # ResetLinkExpiredError, ResetLinkInvalidError, WrongPasswordError, PasswordChangeLockedError
├─ application/
│  ├─ ports/
│  │  ├─ i-session-repository.port.ts
│  │  ├─ i-device-repository.port.ts
│  │  ├─ i-token-service.port.ts
│  │  └─ i-attempt-lockout.port.ts
│  ├─ auth.service.ts               # login() — credenciales, bloqueo D-5, estados D-9/D-10
│  ├─ session.service.ts            # open(), refresh(), logout(), list(), revoke(), revokeOthers()
│  ├─ password.service.ts           # requestReset(), checkResetLink(), resetPassword(), changePassword()
│  ├─ client-context.ts             # ClientContext { deviceSecret?: string; userAgent: string; ip: string | null }
│  └─ mail/
│     ├─ guatemala-date.format.ts   # extraído del aviso de intento de 001 (tercer uso)
│     ├─ password-reset-mail.template.ts
│     ├─ new-device-mail.template.ts
│     ├─ password-changed-mail.template.ts
│     └─ session-revoked-mail.template.ts
├─ infrastructure/
│  ├─ persistence/
│  │  ├─ sesion.orm-entity.ts  dispositivo.orm-entity.ts  session.mapper.ts  device.mapper.ts
│  │  ├─ typeorm-session.repository.ts
│  │  └─ typeorm-device.repository.ts
│  ├─ jwt/
│  │  ├─ access-token-options.ts    # ACCESS_TOKEN_OPTIONS: la única constante de verificación (ADR-0017 c.2)
│  │  ├─ jwt-token.service.ts       # JwtTokenService implements ITokenService, IAccessTokenVerifier (verifyAsync + IClock;
│  │  │                             # parseAccessTokenClaims es privada)
│  │  └─ jwt.strategy.ts            # JwtStrategy (passport-jwt, ACCESS_TOKEN_STRATEGY, ignoreExpiration: true); validate(req) → puerto
│  └─ redis-attempt-lockout.ts      # RedisAttemptLockout implements IAttemptLockout (Lua)
├─ presentation/
│  ├─ auth.controller.ts            # + login, refresh, logout; verifyEmail abre sesión
│  ├─ password.controller.ts        # forgotPassword, checkResetLink, resetPassword, changePassword
│  ├─ sessions.controller.ts        # list, revoke, revokeOthers
│  ├─ session-cookies.ts            # nombres, rutas y opciones de las dos cookies; set/clear; readCookie (DT-9)
│  ├─ client-context.factory.ts     # readClientContext(req): cookie de dispositivo, User-Agent, req.ip
│  └─ identity-ip-throttler.guard.ts# nace en 001 (DT-8); 002 agrega `login-ip` a su tabla throttler → ámbito
└─ identity.module.ts               # + JwtModule, PassportModule, proveedores nuevos; exporta I_ACCESS_TOKEN_VERIFIER
```

### 6.2 Dominio y reglas

- **`RefreshToken`**: valor = `<sid>.<secreto>`, con `sid` el uuid de la sesión y `secreto` = `OpaqueToken.generate()`
  (256 bits, base64url de 43 caracteres). Se guarda `OpaqueToken.hashOf(secreto)`. `parse(valor)` exige exactamente
  un uuid, un punto y un secreto bien formado; si no, la aplicación responde `IDENTITY_REFRESH_INVALID` sin consultar.
- **`Session`** (inmutable, Art. VII.7; las duraciones llegan como argumentos porque el dominio no importa `contracts`):
  - `Session.open({ id, userId, deviceId, secretHash, now, maxLifetime })` → `creada_en = ultimo_uso = now`,
    `expira_en = now + maxLifetime`.
  - `stateAt(now, idleTimeout)` → `revoked` si `revocada_en`; `expired` si `now >= expira_en` o
    `now >= ultimo_uso + idleTimeout`; `active` en otro caso.
  - `matchSecret(hash, now, grace)` (comparación con `timingSafeEqual`) → `current` si coincide con `refresh_hash`;
    `previousWithinGrace` si coincide con `refresh_anterior_hash` y `now - rotado_en <= grace`; `reuse` en cualquier otro
    caso: un token más viejo, el anterior fuera de la gracia, o un secreto falsificado con un `sid` conocido. Las tres
    ramas de «reuse» revocan (D-3): es el lado seguro.
  - `rotate(newHash, now)` → `refresh_anterior_hash = refresh_hash`, `refresh_hash = newHash`, `rotado_en = ultimo_uso = now`.
  - `revoke(now)` es idempotente.
  - `refreshCookieMaxAge(now, idleTimeout)` = `min(idleTimeout, expira_en - now)`: la cookie nunca dura más que la
    sesión (RN-5).
- **`Device`**: `register({ id, userId, secretHash, userAgent, ip, now })` trunca el agente de usuario a 512
  caracteres. `seen({ userAgent, ip, now })` actualiza `ultimo_acceso`, `agente_usuario` y `ultima_ip`.
- **`UserAgentSummary.parse(ua)`**: función pura con tabla de patrones en orden (Edge antes que Chrome, Chrome antes
  que Safari, Samsung Internet, Opera, Firefox; Windows, macOS, iOS/iPadOS, Android, ChromeOS, Linux). Lo desconocido da
  «Navegador desconocido» / «Sistema desconocido». `deviceKind` por `Mobi`/`iPhone`/`Android` (móvil) e `iPad`/`Tablet`
  (tableta). Pruebas con una muestra de cadenas reales (DT-9).
- **Contraseñas**: la política es `evaluatePassword(password, email)` de `contracts` (001), aplicada por la aplicación
  con el correo de la cuenta en restablecer (CA-21) y cambiar (CA-22).
- **Enlace de recuperación**: la entidad `VerificationToken` de 001 con `type = 'recuperacion'`. El nombre de la clase
  se conserva (su contrato ya cubre los dos tipos, `design-model.md` §4); renombrarla a `AccountToken` es cosmético y
  queda fuera.

### 6.3 Aplicación

Puertos de `identity` (Art. V):

| Puerto | Firma | Regla |
|---|---|---|
| `ISessionRepository` (diagrama) | `insert(session)`, `findByIdForUpdate(id)`, `update(session)`, `listActive(userId, now, idleCutoff, limit)` (con `agente_usuario` del dispositivo), `revokeIfActive(id, userId, now): Promise<boolean>`, `revokeAllExcept(userId, exceptId \| null, now): Promise<number>` | (b) |
| `IDeviceRepository` (nuevo) | `upsertSeen(device): Promise<{ deviceId; isNew }>` con `INSERT … ON CONFLICT (usuario_id, huella_hash) DO UPDATE … RETURNING id, (xmax = 0) AS inserted` | (b) |
| `ITokenService` (diagrama) | `issueAccessToken({ userId, role, sessionId }): Promise<{ token; expiresAt }>` | (a) JWT |
| `IAttemptLockout` (nuevo) | `check(key): Promise<LockState>`, `recordFailure(key, policy): Promise<LockState>`, `clear(key): Promise<void>`; `LockState = { locked: false } \| { locked: true; retryAfterSeconds }`; `policy = { maxFailures, windowSeconds, lockSeconds }` | (a) Redis |

Puerto de `shared` que implementa (lo crea 003-PR-A en `shared/application/auth/i-access-token-verifier.port.ts`):
`IAccessTokenVerifier.verify(token): Promise<AccessTokenVerification>`, con
`AccessTokenVerification = { valid: true; claims: AccessTokenClaims } | { valid: false; reason: 'expired' | 'invalid' }`
y `AccessTokenClaims = { userId; role: Role; sessionId }` (CA-26: «devuelve `id`, `rol` y `sid`», en `claims`).
**Nunca lanza** ante un token malo: vencido → `reason: 'expired'`; alterado, otra clave, otro algoritmo o *claims*
inválidos → `reason: 'invalid'`. El `JwtAuthGuard` de 003 traduce el fallo a `SHARED_UNAUTHENTICATED`, registra el
motivo, arma el `Actor` (`canReadContent`, R-9) y escribe `RequestPrincipal`.

Puertos que consume: `IUserRepository`, `IVerificationTokenRepository`, `IPasswordHasher`, `VerificationLinkIssuer`
(001); `IMailer` (`notifications`); `IRateLimiter`, `ITransactionRunner`, `IClock` (`shared`).

**Regla transversal: revocar y después lanzar.** Donde un rechazo también escribe (reúso, cuenta suspendida), la
transacción **devuelve** un resultado discriminado, se confirma, y el servicio lanza el error **después del commit**.
Lanzar dentro de `ITransactionRunner.run` desharía la revocación.

**`AuthService.login(command, client)`** (ya pasó el guard por IP y el pipe):

1. `email = EmailAddress.of(command.email)`; `key = 'identity:lockout:login:' + sha256(email)`.
2. `lockout.check(key)` → bloqueado: registra `identity.login.locked` y lanza `LoginLockedError(retryAfter)` **sin**
   consultar la cuenta (CA-5).
3. `user = users.findByEmail(email)`. Si no existe: `hasher.verify(DUMMY_HASH, password)` (PHC Argon2id calculado una
   vez al iniciar el módulo con los parámetros de `Argon2idHasher`) para igualar el tiempo (CA-2), `recordFailure`,
   `InvalidCredentialsError`.
4. `hasher.verify(user.passwordHash, password)` falso → `recordFailure(key, LOGIN_POLICY)` → `InvalidCredentialsError`
   (el quinto fallo todavía responde credenciales inválidas; el sexto intento ya encuentra el bloqueo, CA-5).
5. Contraseña correcta: `SUSPENDED` → `AccountSuspendedError` (D-10); no verificada → `EmailNotVerifiedError` (R-4).
   Ninguno de los dos cuenta como fallo.
6. `lockout.clear(key)` (DT-4) → `SessionService.open(user, client, 'login')` → devuelve el resultado al controlador.

**`SessionService.open(user, client, origin: 'login' | 'verification')`**:

1. `deviceSecret = client.deviceSecret` si está bien formado; si no, `OpaqueToken.generate()` y `newDeviceCookie = true`.
2. En transacción: `devices.upsertSeen(...)` → `{ deviceId, isNew }`; `RefreshToken.issue(sessionId)`;
   `Session.open(...)`; `sessions.insert`.
3. Fuera de la transacción: `tokens.issueAccessToken({ userId, role, sessionId })`.
4. Después del commit, solo si `origin = 'login'` y `isNew`: correo «Nuevo inicio de sesión en Nimbo» (CA-16, RN-7) y
   `identity.device.new`. Con `origin = 'verification'` el dispositivo queda conocido sin aviso (D-4).
5. Devuelve `{ access, refreshToken, refreshMaxAge, deviceCookie?: string, user }`. El controlador escribe las cookies.

**`SessionService.refresh(rawToken, client)`**:

1. `RefreshToken.parse` falla → `RefreshInvalidError` (sin consulta).
2. En transacción, `findByIdForUpdate(sid)` (serializa dos renovaciones simultáneas):
   - no existe → `invalid`;
   - `stateAt = revoked` → `revoked`; `expired` → `expired` (CA-8);
   - `matchSecret`: `previousWithinGrace` → `invalid` **sin revocar** (CA-9, RN-4); `reuse` → `revoke` + `update` →
     `reuse`;
   - `current` → `users.findById`: suspendida → `revoke` → `revoked` (CA-10, D-10); activa → `rotate` + `update` →
     `rotated`.
3. Después del commit, según el resultado: `rotated` → emite el token de acceso y devuelve la cookie nueva (CA-7);
   `reuse` → correo «Cerramos una sesión por seguridad» con navegador · sistema del dispositivo,
   `identity.session.reuse_detected` (`warn`) y `SessionRevokedError`; `revoked` → `SessionRevokedError`; `expired` →
   `SessionExpiredError`; `invalid` → `RefreshInvalidError`.

**`SessionService.logout(rawToken)`**: si el token se parsea y su secreto es `current` o `previousWithinGrace` de una
sesión no revocada, la revoca (CA-14). En cualquier otro caso no hace nada (sin correo). Siempre `204`.

**`SessionService.list(actor, currentSessionId)`**: `listActive(actor.id, now, now − 7 d, 50)`, marca `current`,
ordena la actual primero y resume el agente con `UserAgentSummary` (D-9, CA-11).
**`revoke(actor, sessionId, currentSessionId)`**: `revokeIfActive(sessionId, actor.id, now)` (el filtro por dueño va en
el `UPDATE … WHERE id = $1 AND usuario_id = $2 AND revocada_en IS NULL`); falso → `SessionNotFoundError` (CA-12);
devuelve `{ wasCurrent }` para que el controlador borre la cookie.
**`revokeOthers(actor, currentSessionId)`**: `revokeAllExcept(actor.id, currentSessionId, now)` → `revokedCount` (CA-13).
`SessionService` **no** tiene `revokeAll`: `PasswordService.resetPassword` llama directamente a
`ISessionRepository.revokeAllExcept(userId, null, now)` dentro de su transacción (paso 4).

**`PasswordService.requestReset(command)`** (neutra, CA-18):

1. `email = EmailAddress.of(...)`; `IRateLimiter.consume('identity:password-reset-request:' + sha256(email),
   [{ limit: 1, windowSeconds: EMAIL_REQUEST_COOLDOWN_SECONDS }, { limit: EMAIL_REQUESTS_PER_HOUR, windowSeconds: 3600 }])`
   **antes** de buscar; rechazado → `IdentityTooManyRequestsError(scope: 'password_reset')`.
2. En transacción, `findByEmailForUpdate(email)`:
   - no existe → nada (`identity.password_reset.requested`, `kind: 'ignored'`, sin `userId`);
   - verificada (cliente o interna; también suspendida, DT-6) → `invalidateActive(userId, 'recuperacion', now)` →
     `OpaqueToken.generate()` → `VerificationToken.issue({ type: 'recuperacion', expiresAt: now + 60 min })` → insert →
     correo con `{WEB_PUBLIC_URL}/restablecer-contrasena#token=<valor>` (fragmento, como 001);
   - cliente no verificado (D-15) → consume **en silencio** la clave de límite de 001
     (`identity:email-request:…`); permitido → `VerificationLinkIssuer.issue(user)`; rechazado → no envía y registra
     `kind: 'verification_suppressed'` (DT-7). La respuesta no cambia.
3. Después del commit envía el correo, si lo hay. Devuelve `void` → `202`.

**`PasswordService.checkResetLink(token)`**: mal formado o `findByHash(hash, 'recuperacion')` vacío → `ResetLinkInvalidError`;
`stateAt(now)`: `expired` → `ResetLinkExpiredError`; `used`/`invalidated` → `ResetLinkInvalidError`; `valid` → `ok`.
No consume (CA-20, «al abrirse»).

**`PasswordService.resetPassword(command)`**:

1. `checkResetLink` (mismos errores). 2. `user = findById(row.userId)`; `evaluatePassword(password, user.email)` con
   fallos → `IdentityWeakPasswordError` y el enlace **sigue vigente** (CA-21). 3. `passwordHash = hasher.hash(...)`
   (fuera de la transacción: ~100 ms que no deben retener el bloqueo). 4. En transacción: `findByIdForUpdate(userId)`;
   `consume(id, now)` → 0 filas → `invalid` (CA-20, dos envíos simultáneos: solo uno consume); `update(user con el hash
   nuevo)`; `sessions.revokeAllExcept(userId, null, now)` (RN-6). 5. Después del commit: `lockout.clear` del inicio de
   sesión y del cambio de contraseña (D-6, DT-5), correo «Tu contraseña cambió» (con el enlace a
   `{WEB_PUBLIC_URL}/recuperar-contrasena`), `identity.password_reset.completed` con `revokedCount`. No crea sesión.

**`PasswordService.changePassword(actor, currentSessionId, command)`**:

1. `key = 'identity:lockout:password-change:' + actor.id`; `check` → bloqueado → `PasswordChangeLockedError` (aunque la
   actual sea correcta, CA-23).
2. `user = findById(actor.id)`; `hasher.verify(...)` falso → `recordFailure(key, PASSWORD_CHANGE_POLICY)` →
   `WrongPasswordError`. La sesión nunca se cierra (D-7).
3. `evaluatePassword(newPassword, user.email)` → `IdentityWeakPasswordError`.
4. Hash fuera de la transacción; en transacción: `update` + `revokeAllExcept(actor.id, currentSessionId, now)`.
5. Después del commit: `lockout.clear(key)`, correo «Tu contraseña cambió», `identity.password.changed` con
   `revokedCount` (CA-22).

Métodos de ≤ 30 líneas: cada rama es un método privado. `AuthService` tiene 1 método público, `SessionService` 6 y
`PasswordService` 4 (guía de ~7, `conventions.md`).

### 6.4 Infraestructura de `identity`

- **`ACCESS_TOKEN_OPTIONS`** (proveedor construido una sola vez desde el entorno validado):
  `{ secret: JWT_ACCESS_SECRET, algorithms: ['HS256'], ttlSeconds: ACCESS_TOKEN_TTL_SECONDS }`. **Sin** `issuer` ni
  `audience`: RN-10 limita los *claims* a `sub`, `rol`, `sid`, `iat` y `exp` (DT-10). Lo usan los dos caminos de
  ADR-0017 c.2:
  - `JwtTokenService.issueAccessToken` firma `{ sub, rol, sid, iat, exp }` con `iat`/`exp` calculados con `IClock`
    (no con `expiresIn`), para que `FixedClock` los controle. `verify` (el puerto `I_ACCESS_TOKEN_VERIFIER`) llama a
    `JwtService.verifyAsync(token, { secret, algorithms, clockTimestamp: clock.now() })` y pasa el resultado por
    `parseAccessTokenClaims` (**privada** de `JwtTokenService`), que exige `sub` y `sid` uuid, `rol ∈ Role` y ningún
    *claim* extra de los esperados. Nunca lanza ante un token malo: vencido → `{ valid: false, reason: 'expired' }`;
    cualquier otro fallo → `{ valid: false, reason: 'invalid' }`; válido → `{ valid: true, claims }`. Es el **único**
    que decide firma, algoritmo y vencimiento, con `IClock`.
  - `JwtStrategy` (`PassportStrategy(Strategy, ACCESS_TOKEN_STRATEGY)`, con `ACCESS_TOKEN_STRATEGY` de `shared`):
    `secretOrKey` y `algorithms` desde `ACCESS_TOKEN_OPTIONS` (la **única** constante);
    `jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken()`; `passReqToCallback: true`; `ignoreExpiration: true`
    (el vencimiento lo decide solo el puerto; con dos relojes, un token emitido con `FixedClock` sería válido por un
    camino y vencido por el otro). `validate(req)` extrae el token y **delega en el puerto**: `valid` → devuelve
    `claims`; `{ valid: false, reason }` → **no lanza**: devuelve `[false, { reason }]` (`PassportStrategy` de Nest lo
    pasa como `done(null, false, info)`), para que el motivo `'expired' | 'invalid'` llegue en `info` a
    `JwtAuthGuard.handleRequest`, el **único** punto que traduce el error a `SHARED_UNAUTHENTICATED`. No interpreta *claims*
    ni arma el `Actor`: eso lo hace `handleRequest` del `JwtAuthGuard` de 003, que escribe `RequestPrincipal`.
  - La prueba de contrato es la suite única de 003 (`apps/api/test/support/access-token-verifier.contract.ts`), que
    002-PR-2 corre con el verificador real, por el puerto y por HTTP (§8, CA-26).
- **`RedisAttemptLockout`** (usa `REDIS_CLIENT` de `shared`): un script Lua por operación, con `now` de `IClock`:
  - `recordFailure`: `ZADD <key>:fails now`, `ZREMRANGEBYSCORE` fuera de la ventana, `ZCARD`; si llega a
    `maxFailures`, `SET <key>:lock <now + lockSeconds> PX (lockSeconds + 60) * 1000` y `DEL <key>:fails`;
  - `check`: `GET <key>:lock`; si el valor es mayor que `now`, `locked` con `ceil((valor − now) / 1000)`;
  - `clear`: `DEL` de las dos claves.
  - El vencimiento real lo decide el valor guardado frente a `now` (no el TTL de Redis, que solo limpia), así las
    pruebas avanzan el tiempo con `FixedClock` (CA-5, CA-23). Las claves llevan `sha256(correo)` o el `userId`, nunca
    el correo. Redis caído → lanza (500), falla cerrado (§9).
- **Repositorios TypeORM**: como los de 001 (entidad ORM + mapper, `EntityManager` de `TransactionContext`). Todas las
  consultas de `ISessionRepository` que reciben `userId` lo ponen en el `WHERE` (Art. IX.2). `listActive` hace un
  `JOIN dispositivo` para el agente de usuario y no selecciona `huella_hash`, `ultima_ip` ni hashes.
- **Plantillas de correo** (`application/mail/`, funciones puras `{ subject, text, html }`, plantilla de 600 px de
  `correos--registro.html`, textos de spec §11, RN-9): asuntos «Restablece tu contraseña de Nimbo» (propuesto), «Nuevo
  inicio de sesión en Nimbo» (spec), «Tu contraseña de Nimbo cambió» (propuesto) y «Cerramos una sesión por
  seguridad» (spec, CA-9). Fecha y hora con `guatemala-date.format.ts` (`Intl.DateTimeFormat('es-GT', { timeZone:
  'America/Guatemala' })`). Enlaces: `{WEB_PUBLIC_URL}/cuenta/seguridad` y `{WEB_PUBLIC_URL}/recuperar-contrasena`.
  Ninguna lleva IP. El `ui-designer` las valida.

### 6.5 Presentación de `identity`

- **Cookies** (`session-cookies.ts`, única fuente de nombres y opciones, DT-2):

  | Cookie | Valor | `Path` | `Max-Age` | Atributos |
  |---|---|---|---|---|
  | `nimbo_rt` | `RefreshToken` | `/api/v1/auth/session` (solo renovar y cerrar, D-1) | `refreshCookieMaxAge` (≤ 7 d y ≤ lo que falte para 30 d) | `HttpOnly`, `SameSite=Strict`, `Secure` si `APP_ENV ∈ {staging, production}` |
  | `nimbo_did` | secreto del dispositivo | `/api/v1/auth` (login y verificación) | 365 d, reemitida en cada inicio de sesión y verificación (§6 de la spec: «desde la última vez que se emitió») | ídem |

  - Se escriben con `res.cookie()` de Express (`@Res({ passthrough: true })`); se leen con `readCookie(req, name)`,
    un lector mínimo de la cabecera `Cookie` (valores base64url, DT-9).
  - Un `Set-Cookie` con `Path=/api/v1/auth/session` es válido desde `/auth/login`, `/auth/verify-email`,
    `/auth/reset-password` y `/sessions/:id`: el navegador acepta una ruta distinta de la de la petición.
  - **Nunca** se borra la cookie de refresco ante `IDENTITY_REFRESH_INVALID`: en una carrera entre pestañas, la cookie
    del navegador ya puede ser la nueva.
- **`AuthController`**: todas sus rutas llevan `@Public()` de 003. `login` (`@UseGuards(IdentityIpThrottlerGuard)`, `@SkipThrottle({ 'register-ip': true })`,
  pipe con `loginRequestSchema`, `readClientContext`), `refresh` y `logout` (sin cuerpo; leen `nimbo_rt`) y
  `verifyEmail` (001), que en el resultado `VERIFIED` llama a `SessionService.open(user, client, 'verification')`
  dentro de un `try/catch`: si falla, registra `identity.verification.session_failed` y responde `verified` sin
  `session` (001 §6.11). `register` gana `@SkipThrottle({ 'login-ip': true })`.
- **`PasswordController`** (`@Controller('auth')`): `forgot-password` (202), `reset-password/check`, `reset-password`
  (borra `nimbo_rt`), las tres con `@Public()`, y `change-password` (`@Roles(...)` de 003 con los cuatro roles,
  `@CurrentActor() actor` y `@CurrentSessionId() sessionId` de 003).
- **`SessionsController`** (`@Controller('sessions')`, `@Roles(CLIENT, ADMIN, SUPPORT, OPERATOR)`; cada método recibe
  `@CurrentActor() actor` y `@CurrentSessionId() sessionId`, que leen `RequestPrincipal`; nadie lee `req.user`): `GET`, `DELETE
  :id` (el `id` se valida con `z.string().uuid()`; mal formado → `SessionNotFoundError`, igual que ajeno, 003 D-6) y
  `POST revoke-others`. Sin reglas de negocio.
- **`IdentityIpThrottlerGuard`** (DT-8): la subclase de `ThrottlerGuard` que ya nace con ese nombre en 001, con una
  tabla *throttler* → ámbito que en 001 solo tiene `register-ip`. 002-PR-2 agrega `login-ip` a la tabla y los
  `@SkipThrottle` cruzados (si 001-PR-3 se integró con el nombre viejo, el renombrado va en 002-PR-2). Traduce el
  *throttler* que disparó (`register-ip` o `login-ip`) al `scope` de `IdentityTooManyRequestsError` (DT-20), conserva el
  `Retry-After` y sigue sin cabeceras `X-RateLimit-*`. `ThrottlerModule.forRoot` gana `{ name: 'login-ip', ttl:
  15 min, limit: LOGIN_ATTEMPTS_PER_IP }`; en `@nestjs/throttler` v6 cada ruta con el guard aplica **todos** los
  *throttlers*, así que `register` omite `login-ip` y `login` omite `register-ip` (ADR-0017), con prueba (CA-6).
  Cuenta **todas** las peticiones de inicio de sesión de la IP, correctas o no (D-5); corre antes del pipe, así que
  el intento 21 no evalúa credenciales (CA-6).
- **IP real**: `req.ip` con `trust proxy = 1` (001). Solo se guarda en `dispositivo.ultima_ip`.

### 6.6 `notifications` y `worker`

Sin cambios. Los correos usan `IMailer.send` con las claves de §5 Eventos.

### 6.7 Cambios en `shared`

| Pieza | Ubicación | Detalle |
|---|---|---|
| Puerto, `ACCESS_TOKEN_STRATEGY`, `JwtAuthGuard`, decoradores | — | **No los toca 002**: nacen en 003-PR-A (`application/auth/i-access-token-verifier.port.ts` y los guards de 003 §6.2) |
| `configureHttpApp` | `presentation/configure-http-app.ts` | CORS: `credentials: true` (la cookie viaja entre `staging.nimbo.me` y `api.staging.nimbo.me`, mismo sitio), `allowedHeaders` + `authorization`, `methods` + `DELETE`. Los orígenes siguen explícitos (`CORS_ORIGIN`), nunca comodín con credenciales |
| `REDACTED_FIELDS` | `infrastructure/logging/redacted-fields.ts` | + `currentPassword`, `newPassword`. `authorization`, `cookie` y `set-cookie` ya se redactan (000) |
| `SECRET_KEYS`, `apiEnvSchema` | `infrastructure/config/` | + `JWT_ACCESS_SECRET`, declarada solo en `apiEnvSchema` (la regla de 001: cada secreto en `api` **o** en `worker`) |

### 6.8 Composición

- `IdentityModule.forRoot(env)`: + `JwtModule.register({})` (el secreto lo pasa `JwtTokenService` en cada llamada desde
  `ACCESS_TOKEN_OPTIONS`), `PassportModule`, `JwtStrategy`, `RedisAttemptLockout`, repositorios, servicios y
  `{ provide: I_ACCESS_TOKEN_VERIFIER, useExisting: JwtTokenService }`, que **exporta**. `IDENTITY_CONFIG` gana
  `cookieSecure` (desde `APP_ENV`). La `JwtStrategy` se registra con el nombre `ACCESS_TOKEN_STRATEGY`, que es como la
  encuentra el `JwtAuthGuard` de `shared` sin importar `identity`.
- `AppModule`: `login-ip` en `ThrottlerModule.forRoot`; sigue importando `IdentityModule`. Los guards globales los
  activa 003-PR-A con su `AuthGuardsModule` estático (sin `forRoot`); 002 no crea módulo de composición propio. Cómo
  llega el puerto a `realtime` lo decide 015.
- Arnés de pruebas: `createTestApp` con `overrideProvider(I_CLOCK)` como en 001. **Sin** controlador de prueba propio:
  el tramo HTTP de la prueba de contrato usa la ruta sonda de la suite de 003. 002-PR-2 sustituye en el arnés de
  aislamiento de 003 los tokens del verificador falso por tokens reales emitidos por `JwtTokenService`.

### 6.9 Frontend (`apps/web`)

Rutas:

| Ruta | Tipo | Estados (spec §11) | CA |
|---|---|---|---|
| `app/(public)/iniciar-sesion/page.tsx` (reemplaza el marcador de 001 T-58) | Client Component en el `PublicHeader` de 001; esquema de dos columnas del mockup (p. 07) | default, enviando, error (credenciales), bloqueado (minutos de `Retry-After`), limite-ip, no-verificado (alerta con «Pedir un enlace nuevo» → `/registro/pedir-enlace`, correo prellenado por `sessionStorage` como acordó 001), suspendida, sesion-terminada (`?sesion=terminada`) | CA-1 a CA-6, CA-8 |
| `app/(public)/recuperar-contrasena/page.tsx` | formulario de correo (esquema de `registro--pedir-enlace`) → panel «Revisa tu correo» (como `registro--exito`, sin «Cambiar correo») | default, enviando, error, limite, revisa-tu-correo | CA-18 |
| `app/(public)/restablecer-contrasena/page.tsx` | Client Component: lee `#token`, lo borra con `history.replaceState`, llama a `check` **una vez** (guardia contra `StrictMode`, como 001) | verificando, default (contraseña nueva + confirmación + `PasswordRequirements`), error-campos, enviando, enlace-expirado, enlace-invalido, exito («Listo. Cambiamos tu contraseña…» + «Iniciar sesión») | CA-19 a CA-21 |
| `app/(app)/layout.tsx` | grupo **exterior** con sesión: `SessionProvider` + `SessionGate`. Los grupos `(cliente)` e `(interno)` de 003 (DT-12) van **anidados** dentro, cada uno con su marco | cargando (renovando), redirección a `/iniciar-sesion` si no hay sesión | CA-8, CA-28 |
| `app/(app)/cuenta/seguridad/page.tsx` | en `(app)`, para los cuatro roles; dos tarjetas: `SessionsCard` y `ChangePasswordForm` | los 15 estados del mockup de Seguridad | CA-11 a CA-14, CA-22, CA-23, CA-27 |
| `app/(app)/(cliente)/archivos/page.tsx` | **solo si 006 no la creó**: marcador «Mis archivos» dentro del marco (destino de CA-1). 006 lo reemplaza | — | CA-1 |

`features/identity/` (se suma a lo de 001):

- `session/session-provider.tsx`: contexto con `{ status, user, accessToken }` en **memoria** (estado de React; nunca
  `localStorage`, `sessionStorage` ni cookies legibles, D-1, CA-28). Programa la renovación un minuto antes de
  `accessTokenExpiresAt`.
- `session/refresh-coordinator.ts`: renovación en **un solo vuelo** por pestaña y serializada entre pestañas con
  `navigator.locks.request('nimbo-refresh', …)` (RN-4, DT-16). Tras esperar el candado, la pestaña manda la cookie que
  dejó la anterior, así que cada pestaña rota una vez sin caer en la gracia. Ante `IDENTITY_REFRESH_INVALID` reintenta
  una sola vez; ante `IDENTITY_SESSION_EXPIRED` o `IDENTITY_SESSION_REVOKED` limpia la memoria y va a
  `/iniciar-sesion?sesion=terminada` (CA-8).
- `session/auth-fetch.ts`: envuelve `lib/api-client.ts` de 001: agrega `Authorization: Bearer`, y ante `401
  SHARED_UNAUTHENTICATED` renueva una vez y repite la petición (003 D-6). Las llamadas a `session/*` usan
  `credentials: 'include'`.
- `session/session-gate.tsx`: al montar sin token, renueva; mientras tanto muestra `StateView` de carga.
- `api.ts`: + `login`, `refresh`, `logout`, `forgotPassword`, `checkResetLink`, `resetPassword`, `changePassword`,
  `listSessions`, `revokeSession`, `revokeOtherSessions`.
- `components/`: `LoginForm`, `RequestResetForm`, `ResetPasswordView`, `SessionsCard`, `SessionRow`,
  `ChangePasswordForm`. Reutiliza `PasswordRequirements`, `CheckEmailPanel` (variante sin «Cambiar correo»), `Alert`,
  `Label`, `Input`, `Button`, `Card`, `Badge` y `StateView` de 000b/001.
- Destino tras iniciar sesión: `homePathFor(role)` de 003 (`CLIENT` → `/archivos`; rol interno → `/interno`). Si
  002-PR-5a llega antes que 003-PR-F, lo crea tal como lo define 003 y 003 lo reutiliza (DT-11).

Componentes compartidos nuevos (`components/nimbo/`; ninguno existe hoy):

- `ConfirmDestructiveDialog`: `<dialog>` nativo con `showModal()` (fondo inerte y foco atrapado por el navegador),
  `role="alertdialog"`, foco inicial en «Cancelar», confirmar `destructive`, botones apilados a 360 px con el
  destructivo arriba (README de Seguridad). Sin Radix (DT-17, como 001 DT-8).
- `AccountMenu`: patrón *menu button* de WAI-ARIA con elementos nativos (nombre y correo fuera del `role="menu"`;
  «Seguridad», «Plan y facturación» —enlace a la ruta de 006a/010 cuando exista, si no se omite— y «Cerrar sesión»).
  Se inserta en la cabecera del `AppLayout` actual. El rediseño completo del `AppLayout` es **PD-33** (000b), no de
  este plan. «Cerrar sesión» desde el menú abre `ConfirmDestructiveDialog` si PD-28 (1) se aprueba; si no, cierra
  directo (Q-3).
- Velo del diálogo: `::backdrop` con el token pendiente de PD-27 (`agent-bg` al 45 % según el mockup). Si el token no
  existe al llegar la tarea, el `ui-designer` lo agrega (tokens nuevos requieren DF y aprobación, Q-4).

Reglas de la interfaz:

- Formularios con `react-hook-form` + `zodResolver` y los esquemas de `contracts`. La confirmación de la contraseña
  nueva es un `refine` **solo del cliente** (D-7): no se envía si no coincide (estado `contrasena-no-coincide`).
- Errores por `code` desde `lib/error-catalog.ts` (Art. VI), con los mensajes de §11 de la spec; los que llevan minutos
  los calculan de `retryAfterSeconds`. `IDENTITY_TOO_MANY_REQUESTS` muestra el mensaje de la pantalla donde ocurre
  (DT-20).
- Tras `IDENTITY_WRONG_PASSWORD`, el campo actual se vacía y recibe el foco; la nueva y la confirmación se conservan
  (README del mockup).
- Fechas: «Activa ahora» / «Última actividad: hace 2 horas» con `Intl.RelativeTimeFormat('es')` e «Iniciada el 24 sep
  2026» con `Intl.DateTimeFormat('es-GT', { timeZone: 'America/Guatemala' })` (D-16), en `lib/format-date.ts`.
- Nombres accesibles completos en cada botón («Cerrar sesión en Safari · iOS»); resultados con `role="status"` en la
  tarjeta que cambió y errores con `role="alert"`; objetivos de 44 px (ADR-0014); solo tokens (Art. XIII).
- Diferencia documentada: el README de Seguridad nombra `IDENTITY_TOO_MANY_REQUESTS` para `contrasena-bloqueada`; la
  spec (fuente de verdad, CA-23) fija `IDENTITY_PASSWORD_CHANGE_LOCKED`. El `ui-designer` corrige el README.

### 6.10 Variables de entorno

| Variable | Proceso | Esquema | `.env.example` (local) | Staging | Secreto |
|---|---|---|---|---|---|
| `JWT_ACCESS_SECRET` | api (solo) | texto de al menos 32 caracteres; con `APP_ENV ∈ {staging, production}`, al menos 43 y distinto del valor de `.env.example` | valor de desarrollo marcado como tal | 32 bytes aleatorios en base64url, en GitHub Environments y el `.env` del Droplet | **sí** (`SECRET_KEYS`) |

- Nada más: `WEB_PUBLIC_URL`, `CORS_ORIGIN` y `API_PUBLIC_URL` (web) ya existen con 001. `Secure` se deriva de
  `APP_ENV`. Las duraciones son constantes de `contracts` (RN-5, YAGNI), no variables.
- Nunca en `NEXT_PUBLIC_*`: la prueba de `pnpm env:check` suma el caso `NEXT_PUBLIC_JWT_ACCESS_SECRET`.
- Es distinta del secreto JWT de ONLYOFFICE (016): cada una firma un tipo de token.

### 6.11 Orden de construcción y PR

Guía de < 400 líneas por PR (`conventions.md`): seis PR parciales, cada uno con bloques completos de `tasks.md` y con
lint, typecheck, unit e int en verde. Los números de PR de 001 son los de su plan §6.12. Orden con 003:
**003-PR-A → 002-PR-2 → 002-PR-4** (no hay 003-PR-E: los guards globales están activos desde 003-PR-A).

| PR | Contenido | Depende de | Puede empezar hoy |
|---|---|---|---|
| **002-PR-1 «contratos, migraciones y shared»** | `contracts/identity` (esquemas, códigos, parámetros, `SUPPORT_CONTACT_EMAIL`); migraciones `dispositivo` y `sesion`; `shared`: CORS con credenciales, `REDACTED_FIELDS`, `JWT_ACCESS_SECRET` y `.env.example`. **No** crea el puerto | **001-PR-1** (contratos de `identity`, `usuario`, `configureHttpApp`, secretos por proceso) | Sí, apilado sobre 001-PR-1 |
| **002-PR-2 «inicio de sesión y sesiones (backend)»** | dominio (`Session`, `Device`, `RefreshToken`, `UserAgentSummary`, errores); puertos; `JwtTokenService` (implementa el puerto), `JwtStrategy`, `RedisAttemptLockout`, repositorios; `AuthService`, `SessionService` (`open`, `refresh`, `logout`); `AuthController` (login, refresh, logout, sesión al verificar, `@Public()`); `login-ip` en la tabla de `IdentityIpThrottlerGuard` y `@SkipThrottle` cruzados; correos de dispositivo nuevo y de sesión cerrada; composición; **tokens reales en el arnés de aislamiento de 003 y la suite de contrato de 003 (tramo del puerto y tramo HTTP) con el verificador real** | **001-PR-3** (y por él PR-1 y PR-2); 002-PR-1; **003-PR-A** (puerto, `ACCESS_TOKEN_STRATEGY`, guards activos, `@Public()`, suite de contrato y las dependencias de ADR-0017) | El dominio puro (sin `contracts` ni infraestructura), ya |
| **002-PR-3 «recuperación de contraseña»** | `PasswordService.requestReset/checkResetLink/resetPassword`; `PasswordController` (tres rutas públicas); correos de recuperación y de contraseña cambiada | 002-PR-2 (`ISessionRepository.revokeAllExcept`, `IAttemptLockout`) | Pruebas unitarias con dobles, en paralelo con PR-2 |
| **002-PR-4 «Seguridad (backend)»** | `SessionService.list/revoke/revokeOthers`; `SessionsController`; `changePassword`; suite de aislamiento | 002-PR-2 (y por él 003-PR-A: `@Roles`, `@CurrentActor()`, `@CurrentSessionId()`) | Servicios y pruebas unitarias, ya |
| **002-PR-5a «web: sesión»** | `SessionProvider`, `SessionGate`, grupo exterior `(app)`, inicio de sesión, recuperar, restablecer, `homePathFor` (si 003-PR-F no llegó) | **001-PR-4** (`api-client`, `error-catalog`, `PublicHeader`, `PasswordRequirements`, `Alert`…); 002-PR-1 (contratos). La prueba manual necesita PR-2 y PR-3 | Componentes con pruebas y API simulada, en cuanto 002-PR-1 esté |
| **002-PR-5b «web: Seguridad»** | `(app)/cuenta/seguridad`, `AccountMenu`, `ConfirmDestructiveDialog` | 002-PR-5a; **Q-3 y Q-4** (bloquean solo este PR). La prueba manual necesita PR-4 | Tras 5a |

- PR-3 y PR-4 van en paralelo tras PR-2. `verification.md`, `security.md`, `ui-review.md` y `review.md` se producen una
  vez, con el PR-5b.
- **Qué necesita 003 de 002**: nada para 003-PR-A (no depende de nadie). 002-PR-2 le entrega los tokens reales para su
  arnés de aislamiento y corre su suite de contrato con el verificador real.
- **Qué desbloquea a 015**: `I_ACCESS_TOKEN_VERIFIER` exportado por `IdentityModule` (002-PR-2).

## 7. Observabilidad

Bitácoras. Todas llevan `correlationId`; identifican la cuenta **solo** por `userId` y la sesión por `sessionId` (uuid
de la fila, no el token). Nunca: correo, contraseña, tokens, valores de cookies, `huella_hash`, identificador de
dispositivo, IP ni el agente de usuario completo (R-8, CA-25).

| Evento | Nivel | Campos | Cuándo |
|---|---|---|---|
| `identity.login.succeeded` | info | `userId`, `sessionId`, `newDevice` | CA-1 |
| `identity.login.failed` | info | `reason: 'invalid_credentials' \| 'email_not_verified' \| 'account_suspended'`, `userId?` (solo si la cuenta existe) | CA-2 a CA-4 |
| `identity.login.locked` | warn | `retryAfterSeconds` | intento durante el bloqueo (CA-5) |
| `identity.lockout.engaged` | warn | `scope: 'login' \| 'password_change'`, `userId?` | el fallo que activa el bloqueo |
| `identity.rate_limited` (001) | warn | `scope: 'ip_login' \| 'password_reset'` (+ los de 001), `retryAfterSeconds` | CA-6, CA-18 |
| `identity.session.refreshed` | info | `userId`, `sessionId` | CA-7 |
| `identity.session.refresh_rejected` | info | `reason: 'malformed' \| 'unknown' \| 'grace' \| 'expired' \| 'revoked' \| 'suspended'`, `sessionId?` | CA-8 a CA-10 |
| `identity.session.reuse_detected` | warn | `userId`, `sessionId` | CA-9 |
| `identity.session.revoked` | info | `userId`, `reason: 'logout' \| 'user' \| 'others' \| 'password_reset' \| 'password_change' \| 'reuse' \| 'suspended'`, `count`, `sessionId?` | CA-9, CA-10, CA-12 a CA-14, CA-19, CA-22 |
| `identity.device.new` | info | `userId`, `deviceId` (uuid de la fila, no la huella) | CA-16 |
| `identity.verification.session_opened` / `session_failed` | info / warn | `userId`, `sessionId?` | CA-15 |
| `identity.password_reset.requested` | info | `kind: 'reset_link' \| 'verification_link' \| 'verification_suppressed' \| 'ignored'`, `userId?` | CA-18 |
| `identity.password_reset.rejected` | info | `reason: 'expired' \| 'invalid' \| 'weak'`, `userId?` | CA-20, CA-21 |
| `identity.password_reset.completed` | info | `userId`, `revokedCount` | CA-19 |
| `identity.password.changed` | info | `userId`, `revokedCount` | CA-22 |
| `identity.password_change.rejected` | info | `userId`, `reason: 'wrong_password' \| 'weak' \| 'locked'` | CA-23 |
| `mail.*` (001) | — | `tag` = `identity.password-reset`, `identity.new-device`, `identity.password-changed`, `identity.session-revoked` | correos |

- `deviceId` es el uuid de `dispositivo.id`, que no es el identificador de la cookie: el que prohíbe R-8 es el secreto
  de la cookie (y su hash). Si el `security-auditor` prefiere omitirlo también, se quita sin cambiar nada más.
- **Métricas**: ninguna nueva (RNF-18 llega con 022). Candidatas: `nimbo_identity_logins_total{result}`,
  `nimbo_identity_refresh_reuse_total`, `nimbo_identity_lockouts_total{scope}`.
- **Alertas**: ninguna. Candidata para 022: `identity.session.reuse_detected` sostenido.

## 7b. Seguridad y privacidad (Art. IX)

- **Credenciales en el navegador (D-1)**: token de acceso solo en memoria; refresco y dispositivo en cookies
  `HttpOnly` que JavaScript no lee (CA-28). `SameSite=Strict` + `Path` estrecho: la cookie de refresco solo viaja a
  `/auth/session/*`, y ningún otro sitio puede provocar ese envío (CSRF, spec §10). El resto de la API exige
  `Authorization: Bearer`, que otro sitio no puede leer ni poner.
- **Mismo sitio**: local `localhost` (web `:3002`, api por Traefik en `:80`: mismo sitio, distinto origen) y staging
  `staging.nimbo.me` / `api.staging.nimbo.me` (mismo dominio registrable). CORS con `credentials: true` y orígenes
  explícitos.
- **Robo de refresco (D-3)**: rotación en cada uso; cualquier secreto que no sea el vigente (salvo el anterior dentro
  de 10 s) revoca la sesión y avisa al dueño. Un atacante que solo conoce el `sid` (visible en la lista o en el JWT)
  puede como mucho **revocar** esa sesión, nunca renovarla: el resultado es seguro.
- **Token de acceso (D-13, RN-10)**: HS256 con clave de ≥ 256 bits del entorno; algoritmo fijado en la verificación
  (sin `none` ni confusión de algoritmos); *claims* mínimos; 15 min. Revocar no invalida el token ya emitido (fuera de
  alcance, spec §12); el refresco sí se corta al instante (CA-12).
- **Anti-enumeración (RN-2)**: bloqueo consultado antes de buscar la cuenta; Argon2id también con correo inexistente;
  los fallos cuentan exista o no la cuenta; mismas cabeceras (sin `Set-Cookie` en fallos, sin `X-RateLimit-*`);
  recuperación con límite previo a la búsqueda y rama no verificada con su propio límite en silencio. Quedan
  diferencias de milisegundos (escrituras en Redis): revisión manual del `security-auditor` (CA-2).
- **Fuerza bruta (D-5, D-7)**: 5 fallos por correo → 15 min; 20 por IP en 15 min; 5 contraseñas actuales incorrectas
  por cuenta → 15 min sin cerrar la sesión. Riesgo de bloqueo malicioso de un tercero: mitigado por el restablecimiento
  (quita el bloqueo) y el límite por IP (spec §13).
- **Secretos en reposo**: refresco, dispositivo y recuperación como SHA-256 (tokens de 256 bits: un hash simple basta,
  como 001 D-19); contraseñas PHC Argon2id. El enlace de recuperación en claro vive en el trabajo de BullMQ hasta su
  entrega (riesgo ya aceptado en 001 §7b; `removeOnFail` a 24 h).
- **Datos personales**: `ultima_ip` y el agente de usuario completos no salen de la BD (D-9); la lista solo da
  navegador, sistema y tipo.
- **Roles internos**: usan las mismas rutas solo sobre su propia cuenta (`usuario_id = actor.id`). Ninguna ruta de 002
  deja ver o cerrar sesiones de otra cuenta (eso es 011, auditado allí). No tocan contenido.
- **Bitácoras**: §7; `REDACTED_FIELDS` + `currentPassword` y `newPassword`; cabeceras `authorization`, `cookie` y
  `set-cookie` ya redactadas.

## 8. Estrategia de pruebas

Unitarias junto al código; integración en `apps/api/test/int/identity/` con Testcontainers (Postgres, Redis, Mailpit),
`FixedClock` en `I_CLOCK` y el procesador de `mail` en la misma app (arnés de 001). Nombres `'CA-n: …'`. Sin E2E con
Playwright: llega en la Fase 2 (PD-41); CA-27 y CA-28 se cubren con pruebas de componentes con jest-axe, la revisión
del `ui-designer` a 360 y 1440 px y la comprobación manual en `verification.md`.

| Criterio | Nivel | Archivo propuesto |
|---|---|---|
| CA-1 | int + unit + web | `test/int/identity/login.int-spec.ts` (`exp − iat = 900`; `Set-Cookie` de `nimbo_rt` con `HttpOnly`, `SameSite=Strict`, `Path=/api/v1/auth/session`; `nimbo_did` solo si no venía; fila de `sesion` ligada al dispositivo); `presentation/session-cookies.spec.ts` (`Secure` con `APP_ENV=staging`, sin él en `local`); `features/identity/components/login-form.spec.tsx` (redirección a `/archivos`) |
| CA-2 | int + unit + iso + manual | `login.int-spec.ts` (correo inexistente vs. contraseña incorrecta: mismo `status`, cuerpo y cabeceras salvo `x-correlation-id`; sin `Set-Cookie`); `application/auth.service.spec.ts` (con correo inexistente se llama a `verify` con `DUMMY_HASH`); `test/isolation/login-enumeration.iso-spec.ts`; tiempos: `security.md` |
| CA-3, CA-4 | int + web | `login.int-spec.ts` (contraseña correcta → `403` con su código y sin cookies; incorrecta → CA-2); `login-form.spec.tsx` (acción «Pedir un enlace nuevo» con el correo en `sessionStorage`) |
| CA-5 | int + unit | `test/int/identity/login-lockout.int-spec.ts` (5 fallos → el 6.º, incluso correcto, `429 IDENTITY_LOGIN_LOCKED` con `Retry-After`, igual con correo inexistente; `FixedClock` + 15 min → permitido; restablecer → permitido al momento); `test/int/identity/redis-attempt-lockout.int-spec.ts` (contrato de `IAttemptLockout`: ventana, bloqueo, `retryAfter`, `clear`, concurrencia) |
| CA-6 | int | `test/int/identity/login-rate-limit.int-spec.ts` (21.º intento por IP con `X-Forwarded-For` → `429 IDENTITY_TOO_MANY_REQUESTS` sin tocar `IAttemptLockout`; los inicios de sesión no consumen `register-ip` ni el registro `login-ip`; sin `X-RateLimit-*`) |
| CA-7 | int + unit | `test/int/identity/refresh.int-spec.ts` (token nuevo, cookie nueva, el anterior fuera de la gracia ya no sirve, `ultimo_uso` actualizado); `domain/session.entity.spec.ts`; `domain/refresh-token.vo.spec.ts` |
| CA-8 | int + unit + web | `refresh.int-spec.ts` (7 d + 1 s sin uso; 30 d + 1 s renovando a diario → `IDENTITY_SESSION_EXPIRED` y cookie borrada; `Max-Age` nunca pasa del límite); `session/refresh-coordinator.spec.ts` (redirige con `?sesion=terminada`); `login-form.spec.tsx` (mensaje) |
| CA-9 | int + unit | `test/int/identity/refresh-reuse.int-spec.ts` (anterior a los 11 s → `SESSION_REVOKED`, ningún token de la sesión sirve, correo en Mailpit; anterior a los 5 s → `REFRESH_INVALID` sin revocar ni borrar cookie; dos renovaciones simultáneas con el mismo token → una rota y la otra cae en la gracia) |
| CA-10 | int | `refresh.int-spec.ts` (sesión revocada → `SESSION_REVOKED`; cuenta suspendida por SQL tras iniciar sesión → `SESSION_REVOKED` y `revocada_en` escrito) |
| CA-11 | int + iso + unit + web | `test/int/identity/sessions.int-spec.ts` (tres navegadores + otra cuenta; sin revocadas ni vencidas; orden; forma exacta del JSON sin IP, hashes ni ids de dispositivo); `test/isolation/sessions-isolation.iso-spec.ts`; `domain/user-agent-summary.vo.spec.ts`; `features/identity/components/sessions-card.spec.tsx` |
| CA-12 | int + iso | `sessions.int-spec.ts` (el refresco de la sesión cerrada falla al instante; su token de acceso verifica con el puerto hasta `FixedClock` + 15 min y después no); `sessions-isolation.iso-spec.ts` (sesión ajena → `404` idéntico a inexistente, sin cambios en la BD) |
| CA-13 | int + web | `sessions.int-spec.ts` (cuatro sesiones → `revokedCount = 3`, la actual sigue); `sessions-card.spec.tsx` (singular y plural) |
| CA-14 | int + web | `test/int/identity/logout.int-spec.ts` (revocada, `nimbo_rt` borrada, `nimbo_did` intacta; cookie ausente → `204`); `DELETE /sessions/:id` de la actual borra `nimbo_rt`; `sessions-card.spec.tsx` y `components/nimbo/confirm-destructive-dialog.spec.tsx` (confirmación, foco, Escape) |
| CA-15 | int | `test/int/identity/verify-email-session.int-spec.ts` (credenciales de CA-1, sesión en la lista, se puede cerrar, dispositivo conocido y sin correo de dispositivo nuevo; con un fallo inyectado al abrir la sesión → `verified` sin `session`); `verify-email-concurrency.int-spec.ts` de 001 ampliado: (a)–(d) sin sesión salvo la apertura ganadora |
| CA-16 | int + unit | `test/int/identity/new-device.int-spec.ts` (navegador nuevo → correo con navegador, sistema, fecha y hora de Guatemala y enlace a Seguridad; mismo navegador → nada; el de la verificación → nada); `application/mail/new-device-mail.template.spec.ts` |
| CA-17, CA-24 | int | `test/int/identity/credential-secrecy.int-spec.ts` (valores de `nimbo_rt`, `nimbo_did` y del token de recuperación sacado de Mailpit buscados en todas las columnas de texto de `usuario`, `token_cuenta`, `dispositivo` y `sesion` y en el `LogSink`; solo aparecen sus SHA-256; `hash_clave` con prefijo `$argon2id$`) |
| CA-18 | int + iso | `test/int/identity/password-reset.int-spec.ts` (cuatro cuentas → `202` idénticos; Mailpit: enlace de 1 h para verificada e interna, enlace de verificación de 001 para la no verificada, nada para la inexistente; 60 s y 5/h con y sin cuenta); `test/isolation/password-reset-enumeration.iso-spec.ts` |
| CA-19 | int | `password-reset.int-spec.ts` (dos navegadores con sesión → ambas revocadas; bloqueo de CA-5 quitado; correo «Tu contraseña cambió»; ninguna fila nueva en `sesion`; `nimbo_rt` borrada) |
| CA-20 | int | `password-reset.int-spec.ts` (vencido con `FixedClock` + 1 h + 1 s → `EXPIRED`; usado, reemplazado, alterado, mal formado y de tipo `verificacion` → `INVALID`, en `check` y en `reset`; la contraseña no cambia); `test/int/identity/password-reset-concurrency.int-spec.ts` (dos `reset` simultáneos → uno `200`, otro `INVALID`) |
| CA-21 | int + unit | `password-reset.int-spec.ts` (débil y «igual al correo» → `IDENTITY_WEAK_PASSWORD` con `fields`; el enlace sigue sirviendo); `application/password.service.spec.ts` |
| CA-22 | int + web | `test/int/identity/change-password.int-spec.ts` (tres sesiones → dos revocadas, la actual renueva bien; correo); `features/identity/components/change-password-form.spec.tsx` (no-coincide no envía; enviando; éxito) |
| CA-23 | int + web | `change-password.int-spec.ts` (`WRONG_PASSWORD` sin cambios; 5 fallos → el 6.º, incluso correcto, `PASSWORD_CHANGE_LOCKED` con minutos; `FixedClock` + 15 min → permitido; la sesión sigue); `change-password-form.spec.tsx` (campo actual vacío y con foco) |
| CA-25 | unit + int | `shared/infrastructure/logging/redacted-fields.spec.ts` (`currentPassword`, `newPassword`); `test/int/identity/auth-logs.int-spec.ts` (todos los flujos de CA-25, incluidos los fallos: eventos presentes con `correlationId`, ninguna línea con correo, contraseña, token, valor de cookie o hash) |
| CA-26 | unit + int | `infrastructure/jwt/jwt-token.service.spec.ts` (válido → `{ valid: true, claims: { userId, role, sessionId } }`; vencido con `FixedClock` → `{ valid: false, reason: 'expired' }`; alterado, otra clave, `alg: none`, `HS512`, *claims* de más o de menos → `{ valid: false, reason: 'invalid' }`; nunca lanza); `infrastructure/jwt/jwt.strategy.spec.ts` (`validate(req)` delega en el puerto: válido → `claims`; inválido o vencido → `[false, { reason }]` sin lanzar; no interpreta *claims*); la suite de contrato única de 003 (`apps/api/test/support/access-token-verifier.contract.ts`), corrida en 002-PR-2 con el verificador real en sus dos tramos: por el puerto y por HTTP (ruta sonda de la suite protegida por el `JwtAuthGuard` global; mismos tokens, mismo resultado). **Sin** archivo de contrato ni controlador de prueba propios de 002 |
| CA-27 | web + manual | `login-form.spec.tsx`, `request-reset-form.spec.tsx`, `reset-password-view.spec.tsx`, `sessions-card.spec.tsx`, `change-password-form.spec.tsx`, `account-menu.spec.tsx`, `confirm-destructive-dialog.spec.tsx` (estados de §11, textos exactos, teclado, jest-axe sin violaciones `serious`/`critical`); revisión del `ui-designer` a 360 y 1440 px en `ui-review.md` |
| CA-28 | web + manual | `session/session-provider.spec.tsx` (espías en `Storage.prototype.setItem` y `document.cookie`: ningún token escrito; recarga simulada → renovación); `verification.md`: inspección en el navegador de `localStorage`, `sessionStorage` y `document.cookie` |
| 001 CA-16, CA-26, CA-29 | int | cerrados por CA-3 y CA-15 de esta spec (spec R-5) |

- **Aislamiento** (`pnpm test:isolation`): `sessions-isolation`, `login-enumeration` y `password-reset-enumeration`.
  Además, 002-PR-2 cambia el arnés de aislamiento de 003 para que use tokens reales de `JwtTokenService`.
- **Contratos** (Art. VIII): `IAttemptLockout` (Redis real) e `IAccessTokenVerifier` (suite de 003 con el verificador
  real, puerto y HTTP).
- **Cobertura**: `domain/` y `application/` de `identity` ≥ 60 % (RNF-11).

## 9. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| **Plazo del Avance 1 (30/09)**: 001, 002 y 003 en tres días, con 002-PR-2 dependiendo de 001-PR-3 y de 003-PR-A | Alta | Entrega del 30 % sin «Seguridad» | Seis PR (§6.11) con el dominio y los contratos ya; 003-PR-A no depende de nadie (≈ 1 día). Mínimo defendible: PR-1, PR-2, PR-3 y PR-5a. Si falta tiempo, se recorta en este orden: PR-5b «Seguridad» (queda el inicio de sesión) y después PR-4, con acuerdo de Adrián y dicho en la entrega. E2E ya en la Fase 2 |
| Ciclo de dependencias entre specs 002 ↔ 003 | Baja | Bloqueo mutuo | No hay ciclo: **003-PR-A → 002-PR-2 → 002-PR-4**. 003-PR-A crea el puerto, los guards (activos), los decoradores y la suite de contrato con un verificador falso; 002-PR-2 implementa el puerto y pone los tokens reales en el arnés de 003; 002-PR-4 usa los guards |
| Cookie de refresco que no llega (sitios distintos, `Secure` en `http`, CORS sin credenciales) | Media | La sesión no sobrevive a una recarga | Mismo sitio en local y staging (§7b); `Secure` solo en staging y producción; prueba unitaria de opciones; prueba manual de recarga en `verification.md` (CA-28) |
| Navegadores sin `navigator.locks` | Baja | Dos pestañas renuevan a la vez y una cae en la gracia | La gracia de 10 s ya lo absorbe (se rechaza sin revocar) y la pestaña reintenta una vez (DT-16). Todos los navegadores objetivo lo soportan |
| Redis caído | Baja | Sin inicio de sesión, recuperación ni cambio de contraseña (500) | Falla cerrado, igual que 001: sin Redis tampoco hay cola de correo. `/health/ready` ya reporta Redis |
| Bloqueo malicioso de una cuenta (D-5) | Media | Molestia de 15 min | Restablecer lo quita al momento (CA-5); límite por IP (spec §13) |
| Token de acceso vigente hasta 15 min tras revocar o suspender | Segura | Acceso breve | Aceptado por la spec (§12, §13); el refresco se corta al instante |
| Analizador propio de agente de usuario incompleto | Media | «Navegador desconocido» en algunos casos | Solo afecta la presentación; muestra de cadenas reales en la prueba; se amplía la tabla sin cambiar el contrato |
| Passport (`JwtStrategy`) y el puerto divergen | Baja | Un token válido por un camino y no por el otro | La estrategia solo delega en el puerto (`ignoreExpiration: true`, una sola constante, `parseAccessTokenClaims` privada del puerto); la suite de contrato de 003 con tramo HTTP (CA-26), como pide ADR-0017 |
| Alguien lee `req.user` en lugar de `@CurrentActor()` | Baja | Actor sin `canReadContent` o sin `sid` | El `Actor` sale solo de `RequestPrincipal` (003 D-11); el revisor lo bloquea |
| Crecimiento de `sesion` | Baja | Tabla grande tras meses | Índice parcial; purga en PD-45 (provisional) |
| Marcos de UI pendientes (PD-27 velo, PD-28 menú, PD-33 `AppLayout`) | Media | Seguridad sin menú de la cuenta o con el marco viejo | `AccountMenu` se inserta en el `AppLayout` actual; el rediseño sigue en PD-33 (000b). Q-3 y Q-4 |

## 10. Decisiones

### 10.1 ADR de los que depende este plan

| ADR | Qué decide para 002 |
|---|---|
| **ADR-0017** (`Aceptado`) | `@nestjs/jwt` + `@nestjs/passport` + `passport` + `passport-jwt` (c.2): `JwtAuthGuard` de `shared` extiende `AuthGuard(ACCESS_TOKEN_STRATEGY)`, la `JwtStrategy` de `identity` (`ignoreExpiration: true`) delega en el puerto, que es el único que decide validez y vencimiento, con **una sola constante**; suite de contrato con tramo HTTP (§6.4, CA-26). Todas las dependencias las instala 003-PR-A. `@nestjs/throttler` por ruta con `@SkipThrottle` cruzado (§6.5); `argon2` (ya en 001) |
| **ADR-0010** (`Aceptado`) | `shared` declara el puerto token→`Actor`; `identity` lo implementa y lo exporta; el guard encuentra la estrategia por su nombre; `realtime` no importa `identity` (§6.7, §6.8) |
| **ADR-0005** (`Aceptado`) | Sin RLS en `dispositivo` ni `sesion` (no son contenido); los privilegios por defecto de `nimbo_app` de 003 los cubren |
| **ADR-0018**, **ADR-0019**, **ADR-0020** (`Aceptado`) | Correo por la cola `mail` (claves sin `:`); ningún evento nuevo; validación con `ZodValidationPipe` y esquemas de `contracts` |

**No se requiere ADR nuevo** y 002 **no instala ninguna dependencia**: las de ADR-0017 (`@nestjs/passport`,
`passport`, `passport-jwt`, `@nestjs/jwt` y `@types/passport-jwt`) las instala 003-PR-A. El agente de usuario y las cookies se leen con código propio (DT-9), así que el ADR menor que la spec
preveía «si se agrega una librería» no hace falta.

### 10.2 Decisiones técnicas del plan (no las tomó la spec)

- **DT-1 Token de refresco `<sid>.<secreto>` con hash vigente y anterior en `sesion`**, sin tabla de historial de
  tokens. Lectura por clave primaria, detección de reúso de **cualquier** token viejo (no solo del inmediato anterior)
  y gracia de 10 s con `refresh_anterior_hash` + `rotado_en`. Alternativa descartada: tabla `token_refresco` con cada
  secreto emitido (más filas, otra tabla fuera del E-R, misma garantía).
- **DT-2 Rutas y cookies**: renovar y cerrar bajo `/auth/session/*` para que un solo `Path` limite la cookie (D-1);
  nombres `nimbo_rt` y `nimbo_did` sin prefijo `__Host-` (exige `Secure`, que no hay en `http://localhost`).
- **DT-3 Bloqueo explícito** (`IAttemptLockout`) en lugar de ventana deslizante con `IRateLimiter`: D-5 cuenta solo
  **fallos**, bloquea 15 min desde el quinto (no «hasta que salga el más viejo») y D-6 exige **quitarlo**; `consume` no
  permite ni consultar sin registrar ni borrar. Un puerto propio de `identity` (regla a, Redis).
- **DT-4 Un inicio de sesión correcto borra los fallos acumulados** del correo. No afecta a D-5 (el bloqueo ya activo
  impide entrar) y evita que tres errores de ayer más dos de hoy bloqueen a quien sí entró en medio. No revela nada a
  quien no conoce la contraseña.
- **DT-5 Restablecer quita los dos bloqueos** (inicio de sesión y cambio de contraseña): los dos mensajes de bloqueo
  ofrecen «restablece tu contraseña» como salida.
- **DT-6 Recuperación de una cuenta suspendida**: se envía el enlace como a cualquier verificada. La respuesta no cambia
  (RN-2), y restablecer no le da acceso porque el inicio de sesión sigue respondiendo `ACCOUNT_SUSPENDED`.
- **DT-7 D-15 con los límites de 001 aplicados en silencio**: el límite de recuperación se aplica antes de buscar
  (neutro); el de verificación de 001, después y sin cambiar la respuesta, porque un `429` solo para cuentas no
  verificadas las delataría.
- **DT-8 `IdentityIpThrottlerGuard`**: un solo guard por IP para registro e inicio de sesión que traduce el
  *throttler* que disparó a su mensaje. **Nace con ese nombre en 001** (plan 001 §6.5), con una tabla *throttler* →
  ámbito que en 001 solo tiene `register-ip`; 002-PR-2 agrega `login-ip` y los `@SkipThrottle` cruzados. Si 001-PR-3
  ya se integró con el nombre viejo, el renombrado va en 002-PR-2.
- **DT-9 Sin librerías para agente de usuario ni cookies**: `UserAgentSummary.parse` y `readCookie` propios, pequeños y
  probados. `ua-parser-js` 2.x cambió a AGPL; `bowser` o `cookie-parser` exigirían un ADR para ganar poco.
- **DT-10 JWT HS256 sin `iss` ni `aud`**: RN-10 fija los *claims*. `iat`/`exp` salen de `IClock`; la verificación del
  puerto usa `clockTimestamp` para que `FixedClock` controle CA-12.
- **DT-11 El usuario en el cuerpo de `login`/`refresh`** (`{ id, fullName, email, role }`) en lugar de un `/me`: la
  web lo necesita al recargar y ya hace esa llamada; cubre el pedido de 003 (`{ id, fullName, role }`). Destino tras
  iniciar sesión con `homePathFor(role)` de 003.
- **DT-12 `POST /auth/reset-password/check`** para mostrar vencido o inválido al abrir el enlace (CA-20, «cuando se
  abre») sin consumirlo.
- **DT-13 Lista de sesiones sin paginación**, con tope de 50: sesiones vigentes de una cuenta (máximo 30 días y 7 sin
  uso); `conventions.md` pide cursor para listados de datos, no para este.
- **DT-14 Estados HTTP**: `401` para credenciales y refresco; `403` para no verificada y suspendida (la contraseña es
  correcta pero la cuenta no puede entrar); `422` para contraseña actual incorrecta (es un campo del formulario y un
  `401` activaría la renovación automática de 003 D-6); `429` para bloqueos y límites con `Retry-After`; `404` para
  sesión ajena o inexistente.
- **DT-15 Tres servicios y `PasswordController`**: sumar todo a `AuthService`/`AuthController` pasaría de la guía de ~7
  métodos (`conventions.md`, como 001 DT-1). Se registra en DF-56 (provisional).
- **DT-16 Renovación en la web**: un vuelo por pestaña, candado entre pestañas con Web Locks, un reintento ante
  `REFRESH_INVALID` y renovación programada un minuto antes del vencimiento.
- **DT-17 `<dialog>` nativo y menú nativo** en lugar de Radix (`AlertDialog`, `DropdownMenu`): accesibles por defecto y
  sin dependencias, en línea con 001 DT-8.
- **DT-19 `dispositivo` por cuenta** con índice único `(usuario_id, huella_hash)` y alta con `ON CONFLICT`, sin
  carrera entre dos inicios de sesión simultáneos desde un navegador nuevo.
- **DT-20 `IDENTITY_TOO_MANY_REQUESTS` con mensaje por ámbito**: el mismo código de 001 con el texto de §11 según la
  ruta (IP de inicio de sesión o recuperación). La web elige el texto por pantalla.

### 10.3 Preguntas

Ninguna bloquea los PR-1 a PR-5a.

- **Q-1 — [RESUELTA] (architect, 2026-09-27, §11.2 y forma única acordada con 003)**: puerto
  `IAccessTokenVerifier` / `I_ACCESS_TOKEN_VERIFIER` con `AccessTokenClaims { userId; role; sessionId }` y
  `AccessTokenVerification = { valid: true; claims } | { valid: false; reason: 'expired' | 'invalid' }`, más
  `ACCESS_TOKEN_STRATEGY = 'jwt'`, en `shared/application/auth/`, nacido en 003-PR-A; `sessionId` por
  `@CurrentSessionId()` de 003 (el PD-42 de este plan no se abre); `JwtAuthGuard extends AuthGuard(ACCESS_TOKEN_STRATEGY)`
  y la `JwtStrategy` de 002 delega en el puerto. Desaparecen `VerifiedAccessToken` y la respuesta `null`.
- **Q-2 (Adrián, no bloquea)**: mensajes que la spec no fija: `IDENTITY_REFRESH_INVALID` («Tu sesión no es válida.
  Inicia sesión de nuevo.»), `IDENTITY_SESSION_REVOKED` («Tu sesión se cerró. Inicia sesión de nuevo.») y
  `IDENTITY_SESSION_NOT_FOUND` («No encontramos esa sesión. Actualiza la lista.»), y los asuntos «Restablece tu
  contraseña de Nimbo» y «Tu contraseña de Nimbo cambió».
- **Q-3 (Adrián, PD-28; bloquea solo el `AccountMenu` del PR-5b)**: ¿«Cerrar sesión» desde el menú de la cuenta pide
  confirmación como en el mockup del layout? Si sí, CA-14 se ajusta para los dos lugares.
- **Q-4 (`ui-designer` y Fátima; bloquea solo el diálogo del PR-5b)**: token del velo (PD-27) y quién inserta el menú de
  la cuenta en el `AppLayout` actual antes del rediseño de PD-33 (este plan propone: 002 agrega solo `AccountMenu`).

### 10.4 Documentos que se actualizan con este plan (los hace quien corresponde)

- **`architect`** (al integrar; números **provisionales**, se renumeran en orden de integración: 003 conserva DF-55 y
  PD-42..PD-44):
  - `design-findings.md`: **DF-56** (Clases M1/T1: `PasswordController`, `AuthController.logout`, `PasswordService`,
    `IDeviceRepository`, `IAttemptLockout` → `RedisAttemptLockout`, `RefreshToken`, `UserAgentSummary`, `JwtStrategy`
    que delega en el puerto, `IdentityIpThrottlerGuard`, `Session` sin `deviceFingerprint`/`ipAddress`; en T1 solo que
    `identity` implementa el puerto que 003 declara) y **DF-57** (E-R de `sesion`/`dispositivo`, contrastado con
    `Diagramas_ER.pdf`: se agregan `refresh_anterior_hash`, `rotado_en`, `ultimo_uso` y `sesion.usuario_id` con FK
    compuesta `(dispositivo_id, usuario_id)` y `UNIQUE (id, usuario_id)` en `dispositivo`; `dispositivo.nombre` no se
    crea, se deriva de `agente_usuario`); DF-11 y DF-15 (parte de sesiones) quedan aplicados;
  - `design-model.md` M1, §4 (`Session`, `Device`); `architecture.md` §6 (cookies, CORS con credenciales). El nombre
    del puerto en T1 y en `architecture.md` §5 lo pone 003;
  - `pendientes.md`: **PD-45** (purga de sesiones vencidas, sin fecha) y PD-07 (redibujo de M1 y E-R con DF-56 y
    DF-57; DF-11 pasa a `Resuelto` con el redibujo). No se abre PD-42 de 002 ni se amplía PD-39.
- **`ui-designer`**: `ui-guidelines.md` §7 (filas de inicio de sesión, recuperación como decisión explícita y
  «Seguridad»); corregir en el README de Seguridad el código de `contrasena-bloqueada`
  (`IDENTITY_PASSWORD_CHANGE_LOCKED`); validar las cuatro plantillas de correo; token del velo (Q-4).
- **developer**: `.env.example` (`JWT_ACCESS_SECRET`); README de `identity` y `shared`; `docs/operations/ambientes.md`
  (secreto JWT en staging, al montarlo).
- **Manual de Usuario** (entregable del curso): «Iniciar sesión», «Recuperar tu contraseña» y «Seguridad» (Fase 4).

## 11. Aprobación de arquitectura

> Sección escrita por el subagente `architect`.

- Veredicto: **Aprobado con cambios** (architect, 2026-09-27). Ningún cambio altera el alcance ni las decisiones de
  la spec; los cambios 1 a 6 cierran Q-1 de este plan y P-1 del plan 003 con **una sola forma** para el puerto y el
  guard, compatible con ADR-0017 c.2 (Passport se conserva, decisión de Adrián). Los PR-1 a PR-3 pueden empezar con
  los cambios aplicados; el PR-4 espera a 003-PR-A y 003-PR-E.

### 11.1 Revisión por punto

| # | Punto | Resultado | Evidencia |
|---|---|---|---|
| 1 | Fronteras | ☑ con cambios 5 y 10 | Todo en `identity` (§3b), `shared` solo declara el puerto. Pero §6.8 crea un segundo mecanismo de enlace (`AccessTokenVerifierModule`) que duplica `AuthGuardsModule.forRoot` del plan 003 §6.2, y la web crea un grupo `(app)` que choca con `(cliente)`/`(interno)` de 003 DT-12 |
| 2 | Grafo | ☑ | Ninguna arista nueva: `identity → shared, notifications`. `shared` no importa `identity`; la estrategia y el guard se encuentran por un nombre declarado en `shared` (cambio 3) |
| 3 | Capas | ☑ | `Session`, `Device`, `RefreshToken`, `UserAgentSummary` puros; `@nestjs/jwt`, Passport, ioredis y TypeORM en `infrastructure`; controladores solo delegan (§6.5) |
| 4 | YAGNI | ☑ con cambios 5, 8 y 9 | Bien: sin tabla de historial (DT-1), sin librerías de agente de usuario ni de cookies (DT-9), sin `/me` (DT-11). Sobran: `AccessTokenVerifierModule` (DT-18), `dispositivo.creado_en` (ninguna regla ni CA lo lee), `SessionService.revokeAll` (§6.3 lo declara pero `resetPassword` llama a `revokeAllExcept`) |
| 5 | DRY | ☑ con cambios 6 y 10 | Bien: parámetros en `contracts`, `OpaqueToken`, `VerificationLinkIssuer`, `evaluatePassword`, una constante de verificación. Duplicados con 003: la prueba de contrato del puerto (002 §8 CA-26 y 003 §6.2), el correo de contacto (`SUPPORT_CONTACT_EMAIL` aquí y `CONTACT_EMAIL` en 003 §6.9) y el destino por rol (§6.9 frente a `homePathFor` de 003) |
| 6 | SOLID | ☑ | Tres servicios con una razón de cambio (DT-15); `IAttemptLockout` separado de `IRateLimiter` con motivo (DT-3); puertos segregados |
| 7 | Seguridad estructural | ☑ | `Actor` en `list`/`revoke`/`revokeOthers`/`changePassword`; filtro por dueño **en** el `UPDATE`/`SELECT` (§6.3); roles internos solo sobre su cuenta, sin contenido (§7b); hashes SHA-256; token solo en memoria (D-1) |
| 8 | Integridad | ☑ con cambio 8 | `FOR UPDATE` en la rotación; «revocar y después lanzar» (§6.3); `ON CONFLICT` en dispositivo; `down` real. Falta garantizar que `sesion.usuario_id` coincide con el dueño del dispositivo |
| 9 | Degradación | ☑ | SMTP caído no rompe nada; Redis caído falla cerrado solo en inicio de sesión y recuperación (igual que 001). Carga, descarga y navegación no dependen de nada nuevo |
| 10 | Recursos | ☑ | Sin procesos ni colas nuevas; un Argon2id extra por fallo (ya medido en 001) |
| 11 | Datos | ☑ con cambio 8 | `char(64)` + `CHECK` como `token_cuenta`, `inet`, `timestamptz`; índice parcial para la lista; lectura del refresco por PK |
| 12 | Diagramas | ☑ con cambios 8 y 12 | Contrastado con `Diagramas_ER.pdf` (texto extraído con `pdftotext`, página «Usuarios, accesos y auditoría»): `SESION(id, refresh_hash, creada_en, expira_en, revocada_en)`, `DISPOSITIVO(id, nombre, ultimo_acceso)`, `USUARIO registra DISPOSITIVO 1:N`, `DISPOSITIVO origina SESION 1:N`. DF-11 (`Aceptado`) cubre `dispositivo`; DF-19 (`Abierto`) no bloquea |

ADR-0010 ☑ (puerto en `shared`, implementación en `identity`, enlace en la raíz). ADR-0019 ☑ (ningún evento nuevo;
D-10 lo pide 011 llamando a `identity`). ADR-0020 ☑ (`ZodValidationPipe` con esquemas de `contracts`; el `:id` mal
formado da `404` a propósito, 003 D-6). `REDACTED_FIELDS` ☑: la redacción es por nombre exacto
(`redact-deep.ts`), así que `currentPassword` y `newPassword` son necesarios; `token`, `accessToken`,
`refreshToken`, `authorization` y `cookie` ya están, y `set-cookie` se redacta por ruta de cabecera en
`logger.options.ts`. `SECRET_KEYS` ☑ (`JWT_ACCESS_SECRET` solo en `apiEnvSchema`). DT-1 ☑ (la forma más simple que
detecta reúso de cualquier token viejo). DT-9 ☑: código propio pequeño y probado, sin dependencia, así que no hace
falta ADR.

### 11.2 Forma única del puerto y del guard (cierra Q-1 de 002 y P-1 de 003)

1. **Puerto** en `shared/application/auth/i-access-token-verifier.port.ts`, con la forma del plan 003 §5:
   `I_ACCESS_TOKEN_VERIFIER`; `AccessTokenClaims { userId; role: Role; sessionId }`;
   `AccessTokenVerification = { valid: true; claims } | { valid: false; reason: 'expired' | 'invalid' }`;
   `IAccessTokenVerifier.verify(token): Promise<AccessTokenVerification>`, que nunca lanza por un token malo. Junto
   al puerto, `ACCESS_TOKEN_STRATEGY = 'jwt'` (nombre de la estrategia de Passport). Motivo: el guard registra el
   motivo (003 CA-16) y el *handshake* de 015 decide su respuesta; `null` pierde el motivo. CA-26 se cumple con
   `claims`.
2. **Nace en 003-PR-A**, con el verificador falso y la suite de contrato `apps/api/test/support/access-token-verifier.contract.ts`.
   003-PR-A no depende de nadie y ya es lo primero del plan 003; 002-PR-1 **no** crea el puerto. 002-PR-2 depende de
   003-PR-A.
3. **HTTP por Passport, verificación en el puerto**:
   - `identity/infrastructure/jwt/jwt.strategy.ts`: `PassportStrategy(Strategy, ACCESS_TOKEN_STRATEGY)` con
     `secretOrKey` y `algorithms` de `ACCESS_TOKEN_OPTIONS` (la **única** constante), `jwtFromRequest:
     fromAuthHeaderAsBearerToken()`, `passReqToCallback: true` e `ignoreExpiration: true`.
   - `validate(req)` extrae el token y **delega en el puerto** (`I_ACCESS_TOKEN_VERIFIER`, que en `identity` resuelve
     a `JwtTokenService`): `valid` → devuelve `claims`; `invalid` → lanza `UnauthenticatedError` de `shared` con el
     `reason`. La estrategia no interpreta *claims*: `parseAccessTokenClaims` pasa a ser privada de `JwtTokenService`.
   - El vencimiento lo decide **solo** el puerto, con `IClock` (`clockTimestamp`); por eso `ignoreExpiration: true`
     en Passport. Con dos relojes, un token emitido con `FixedClock` sería válido por un camino y vencido por el
     otro. Firma y algoritmo se comprueban con la misma constante en los dos pasos.
   - `JwtAuthGuard` (`shared`, 003) `extends AuthGuard(ACCESS_TOKEN_STRATEGY)`: `@Public()` antes de `super`;
     `handleRequest` es el **único** lugar que traduce el fallo a `SHARED_UNAUTHENTICATED`, registra
     `auth.unauthenticated` con el motivo, llama a `createActor` y escribe `RequestPrincipal` (nadie lee `req.user`).
     El guard no importa `identity`: conoce el puerto (los `claims` que recibe son `AccessTokenClaims`) y el nombre de
     la estrategia, ambos de `shared`.
   - Pruebas de 003-PR-A: el arnés registra con el mismo nombre una estrategia de prueba que delega en el verificador
     falso. `@nestjs/passport` y `passport` se instalan en 003-PR-A; `@nestjs/jwt` y `passport-jwt`, en 002-PR-2
     (paquetes ya aceptados en ADR-0017; solo cambia qué PR los agrega).
4. **`sessionId`**: `@CurrentSessionId()` de 003 (lee `RequestPrincipal`). `SessionsController` y `changePassword`
   reciben `@CurrentActor() actor` y `@CurrentSessionId() sessionId`. El pedido PD-42 de este plan queda resuelto aquí
   y no se abre.
5. **Enlace en la raíz**: solo `AuthGuardsModule.forRoot({ imports: [IdentityModule], verifier:
   I_ACCESS_TOKEN_VERIFIER })` del plan 003, en **003-PR-E**. `IdentityModule` exporta `I_ACCESS_TOKEN_VERIFIER`
   (`useExisting: JwtTokenService`) y registra `JwtStrategy`. Cómo llega el puerto a `realtime` lo decide 015.
6. **Prueba de contrato única**: la suite de 003 recibe un segundo tramo, «por HTTP», que manda los mismos tokens
   (válido, vencido con `FixedClock`, alterado, otra clave, `alg: none`, `HS512`, *claims* de más o de menos) a una
   ruta sonda protegida por el guard global y compara con `verify`. La corre 002 con el verificador real (tramo del
   puerto en 002-PR-2; tramo HTTP en cuanto 003-PR-E active los guards). No se agrega otro controlador con
   `AuthGuard('jwt')` a `createTestApp`.

Qué cambia cada plan:

- **002**: §1, §3 (T1), §3b, §6.1, §6.3, §6.4, §6.7, §6.8, §6.11, §8 (CA-26), §9, §10.2 (se borra DT-18) y §10.3
  (Q-1 cerrada) según 1–6; `VerifiedAccessToken` y la respuesta `null` desaparecen.
- **003**: §5 igual; §6.2 `JwtAuthGuard extends AuthGuard(ACCESS_TOKEN_STRATEGY)` con `handleRequest` en lugar de
  llamar a `verify` directamente, `ACCESS_TOKEN_STRATEGY` en PR-A, estrategia de prueba en el arnés, suite de contrato
  con tramo HTTP; P-1 se cierra con esta forma (ni a ni c: variante de b **sin** `I_REQUEST_AUTHENTICATOR`, porque el
  nombre de la estrategia basta y no hace falta un segundo puerto).
- **ADR-0017**: nota de aplicación (sin nueva decisión) que precise que «`JwtAuthGuard` depende solo del puerto»
  significa que no importa `identity` y que los *claims* que usa son los del puerto, y que `AuthGuard('jwt')` es la
  base del guard de `shared` con la estrategia que registra `identity`.

### 11.3 Cambios requeridos

1. Aplicar la forma única de §11.2 en este plan (lista «Qué cambia cada plan»).
2. **002-PR-1** sin el puerto; **002-PR-2** depende de 003-PR-A; **002-PR-4** depende de 003-PR-A (decoradores) y de
   003-PR-E (guards activos para sus pruebas de integración). El riesgo «ciclo 002 ↔ 003» de §9 se reescribe con ese
   orden: 003-PR-A → 002-PR-2 → 003-PR-E → 002-PR-4.
3. `JwtStrategy` con `ignoreExpiration: true` y vencimiento solo en el puerto (§11.2.3); borrar en §6.4 la nota
   «Passport usa el reloj real: la prueba firma los vencidos con `exp` en el pasado real».
4. **DT-8 va directamente en 001**, no como renombrado posterior: el código de 001 no existe y su `tasks.md` está sin
   integrar. El planner de 001 cambia en su plan §6.5 y en T-44 el nombre a `IdentityIpThrottlerGuard`
   (`identity-ip-throttler.guard.ts`) con una tabla *throttler* → `scope` que hoy solo tiene `register-ip`; 002-PR-2
   solo agrega `login-ip` a esa tabla y los `@SkipThrottle` cruzados. Si 001-PR-3 ya se integró con el nombre viejo,
   el renombrado va en 002-PR-2 como dice el plan.
5. Borrar `AccessTokenVerifierModule` y DT-18 (§6.8, §3b composición): el enlace es el de 003 (§11.2.5). `AppModule`
   sigue importando `IdentityModule`.
6. Borrar de §8 CA-26 el archivo propio `access-token-contract.int-spec.ts` y el controlador de prueba con
   `AuthGuard('jwt')`: 002 corre la suite de 003 con el verificador real (§11.2.6); `jwt-token.service.spec.ts` se
   queda.
7. Borrar `SessionService.revokeAll` (§6.3) y la dependencia de 002-PR-3 sobre él: `PasswordService` usa
   `ISessionRepository.revokeAllExcept(userId, null, now)` dentro de su transacción, como ya dice su paso 4.
8. **E-R (DF-56, contrastado con `Diagramas_ER.pdf`)**:
   - usar los nombres del E-R: `sesion.refresh_hash` (no `token_hash`), `sesion.refresh_anterior_hash` y
     `sesion.creada_en` (no `iniciada_en`); los `CHECK` y el dominio se renombran igual;
   - declarar en DF-56 lo que se agrega al E-R: `rotado_en` y `ultimo_uso` (D-2, D-3) y `sesion.usuario_id`, que el E-R
     no tiene (la sesión cuelga solo del dispositivo). Se conserva para filtrar por dueño en la consulta sin `JOIN`
     (Art. IX), pero con coherencia garantizada: `UNIQUE (id, usuario_id)` en `dispositivo` y FK compuesta
     `(dispositivo_id, usuario_id) REFERENCES dispositivo (id, usuario_id) ON DELETE CASCADE` en lugar de las dos FK
     simples;
   - declarar que `dispositivo.nombre` del E-R **no** se crea: el nombre visible se deriva de `agente_usuario` al leer
     (`UserAgentSummary`), y guardarlo duplicaría el dato;
   - quitar `dispositivo.creado_en` (ninguna regla ni CA lo lee; «nuevo» sale de `ON CONFLICT`).
9. Quitar el pedido de ampliar PD-39 (§4 RLS, §10.4): las migraciones de 002 son posteriores a
   `20260928110000`, así que los privilegios por defecto que crea 003 (con `DELETE`, 003 DT-11) las cubren. El
   `DELETE` se conserva porque la purga de sesiones (PD de §4) lo necesitará.
10. **Web, alineada con 003**:
    - `(app)` es el grupo exterior con `SessionProvider` y `SessionGate`; los grupos `(cliente)` e `(interno)` de 003
      van anidados dentro, y `cuenta/seguridad` queda en `(app)` para los cuatro roles;
    - el destino tras iniciar sesión es `homePathFor(role)` de 003 (rol interno → `/interno`, no `/cuenta/seguridad`).
      Si 002-PR-5 llega antes que 003-PR-F, lo crea tal como lo define 003 y 003 lo reutiliza;
    - una sola constante de correo de contacto en `packages/contracts` (`SUPPORT_CONTACT_EMAIL` en `legal.ts`); 003
      usa esa en lugar de `CONTACT_EMAIL` en `lib/contact.ts`;
    - `SessionResponse.user` (`id`, `fullName`, `email`, `role`) cumple el pedido de 003 (`{ id, name, role }`): 003
      usa `fullName`.
11. Partir **002-PR-5** en **5a** (inicio de sesión, recuperar, restablecer, `SessionProvider`, `SessionGate`, grupo
    `(app)`) y **5b** (Seguridad, `AccountMenu`, `ConfirmDestructiveDialog`). Q-3 y Q-4 bloquean solo 5b. El orden de
    recorte de §9 pasa a ser: 5b, después PR-4.
12. **Numeración**: DF-55, DF-56, PD-42 y PD-43 son provisionales y chocan con los de 003 (DF-55, PD-42, PD-43 y
    PD-44). Se asignan al integrar, en orden de integración de los planes; propuesta: 003 conserva los suyos y 002 toma
    **DF-56** (clases M1/T1, antes «DF-55»), **DF-57** (E-R, antes «DF-56», con el contenido del cambio 8) y **PD-45**
    (purga de sesiones, antes «PD-43»). El PD-42 de 002 no se abre (§11.2.4). El `architect` los registra en
    `design-findings.md` y `pendientes.md` en ese momento, junto con PD-07 (redibujo de M1, T1 y E-R) y el paso de
    DF-11 a `Resuelto` cuando se redibuje.

### 11.4 Viabilidad (hoy 27/09, entrega 30/09)

- Mínimo defendible para el 30 %: 002-PR-1, 002-PR-2, 002-PR-3 y 002-PR-5a (iniciar sesión, renovar, cerrar,
  recuperar y restablecer, extremo a extremo). Depende de 001-PR-3 y de 003-PR-A (≈ 1 día y sin dependencias).
- 002-PR-4 y 002-PR-5b dependen además de 003-PR-E, que depende de 002-PR-2: si 003-PR-E no se integra el 29/09,
  «Seguridad» pasa a los primeros días de la Fase 2 con acuerdo de Adrián, y la spec 002 no llega a `Hecha` el 30/09.
  Se dice así en la entrega, no se recorta ningún CA en silencio.

### 11.5 Riesgos arquitectónicos a vigilar

- Que la prueba de contrato encuentre diferencias entre HTTP y el puerto: ADR-0017 ya fija la salida (verificar solo
  en el puerto y dejar la estrategia como adaptador delgado).
- Que alguien lea `req.user` (lo escribe Passport) en lugar de `@CurrentActor()`: el revisor lo bloquea; el `Actor`
  sale solo de `RequestPrincipal` (003 D-11).
- Crecimiento de `sesion` sin purga (PD provisional).
- Diagramas M1, T1 y E-R desalineados hasta PD-07: entregable del Documento de Diseño; se verifica al cierre de la
  Fase 1.

### Cambios aplicados (2026-09-27)

> Escrito por el `planner` al aplicar §11.3 con la **forma única final** acordada con el plan 003 (decisión del
> equipo, 2026-09-27). Donde esa forma difiere de §11.2–§11.4, manda lo que sigue; el texto de arriba se conserva
> como registro de la revisión.

- **Diferencias con §11.2–§11.4 (forma única final)**:
  - **No hay 003-PR-E.** Los guards globales se activan en `AppModule` desde **003-PR-A** con un `AuthGuardsModule`
    estático, sin `forRoot` (sustituye §11.2.5). Lo que era de PR-E (tokens reales en el arnés de aislamiento de 003 y
    correr la suite de contrato de 003 con el verificador real, tramos del puerto y HTTP) lo hace **002-PR-2**
    (sustituye §11.2.6). Orden: **003-PR-A → 002-PR-2 → 002-PR-4**; 002-PR-4 y 002-PR-5b no esperan a ningún PR-E
    (sustituye §11.3.2 y §11.4).
  - **Dependencias**: `@nestjs/passport`, `passport`, `passport-jwt`, `@nestjs/jwt` y `@types/passport-jwt` las
    instala **todas** 003-PR-A; 002 no instala ninguna (sustituye el reparto de §11.2.3).
  - **`JwtStrategy.validate(req)` no lanza**: válido → `claims`; inválido o vencido → `[false, { reason }]`
    (`done(null, false, info)`), para que el motivo llegue en `info` a `JwtAuthGuard.handleRequest`, único punto que
    traduce el error y crea el `Actor` (sustituye «lanza `UnauthenticatedError`» de §11.2.3).
  - **Numeración provisional**: 003 conserva DF-55 y PD-42..PD-44; 002 usa **DF-56** (clases M1/T1), **DF-57**
    (columnas E-R de `sesion`/`dispositivo`) y **PD-45** (purga de sesiones). Se renumeran al integrar.
- **Cambio 1** (forma única): §1, §2, §3 (T1), §3b (tabla y frontera con 003), §5 (`@Public()`), §6.1, §6.3 (puerto
  con `AccessTokenVerification`), §6.4 (`JwtStrategy` con `passReqToCallback: true` e `ignoreExpiration: true` que
  delega en el puerto; `parseAccessTokenClaims` privada de `JwtTokenService`; vencimiento solo con `IClock`), §6.5
  (`@CurrentActor()`, `@CurrentSessionId()`, nadie lee `req.user`), §6.7, §6.8, §8 (CA-26), §9, §10.1, §10.3.
  `VerifiedAccessToken` y la respuesta `null` desaparecen.
- **Cambio 2**: §6.11 (002-PR-1 sin el puerto; 002-PR-2 depende de 003-PR-A) y §9 (ciclo 002 ↔ 003 reescrito).
- **Cambio 3**: §6.4, nota del «reloj real» borrada.
- **Cambio 4**: aplicado en el plan 001 (§6.5 y su tarea) y en §3, §6.1, §6.5 y DT-8 de este plan.
- **Cambio 5**: `AccessTokenVerifierModule` y DT-18 borrados (§3b, §6.8, §10.2).
- **Cambio 6**: `access-token-contract.int-spec.ts` y el controlador de prueba con `AuthGuard('jwt')` borrados (§6.8,
  §8); `jwt-token.service.spec.ts` se queda.
- **Cambio 7**: `SessionService.revokeAll` borrado (§6.1, §6.3, §6.11); `resetPassword` usa
  `ISessionRepository.revokeAllExcept(userId, null, now)`.
- **Cambio 8**: §3 y §4 con los nombres del E-R (`refresh_hash`, `refresh_anterior_hash`, `creada_en`), agregados
  declarados (`rotado_en`, `ultimo_uso`, `sesion.usuario_id`), FK compuesta `(dispositivo_id, usuario_id)` con
  `UNIQUE (id, usuario_id)` en `dispositivo`, sin `dispositivo.nombre` (derivado de `agente_usuario`) ni
  `dispositivo.creado_en`; §6.2 y DT-1 renombrados; DF-57 en §10.4.
- **Cambio 9**: pedido de ampliar PD-39 retirado (§3b, §4, §10.1, §10.4).
- **Cambio 10**: §3b y §6.9 con `(app)` exterior y `(cliente)`/`(interno)` anidados, `cuenta/seguridad` en `(app)`,
  `homePathFor(role)` de 003; `SUPPORT_CONTACT_EMAIL` única en `packages/contracts` (§5); `SessionResponse.user`
  cubre `{ id, fullName, role }` de 003 (§5, DT-11).
- **Cambio 11**: §6.11 con 002-PR-5a y 002-PR-5b; Q-3 y Q-4 bloquean solo 5b; recorte: 5b y después PR-4 (§9).
- **Cambio 12**: numeración provisional aplicada en §3, §4, §6.2 (DT-15) y §10.4.
- Q-1 marcada `[RESUELTA]` (§10.3).
