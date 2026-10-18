# `identity` — M1 · Identidad y Acceso

- **Dueño**: Juan Marcos (`specs/README.md`).
- **Diagrama de origen**: M1 en `docs/sdd/design-model.md` §3 y `docs/design/diagramas/`.
- **Responsabilidad**: Registro, verificación, login, refresh, sesiones y dispositivos.
- **Puede depender de**: shared, notifications, audit (`docs/sdd/architecture.md` §3; el lint de fronteras lo hace cumplir).
- **Specs que lo construyen**: 001 (registro y verificación del correo), 002 (autenticación, sesiones y dispositivos),
  011 (fachadas de cuentas para el backoffice y enlace de alta interna).
- **Decisiones**: ADR-0017 (`argon2` y `@nestjs/throttler`), ADR-0019 (eventos en proceso), ADR-0020 (validación con
  la fábrica de errores de cada módulo).

## Capas y clases (plan 001 §6.1)

```
modules/identity/
├─ domain/                                  # sin Nest, TypeORM, zod ni @nimbo/contracts (ADR-0008, regla 3)
│  ├─ user.entity.ts                        # User (abstracta)
│  ├─ client-user.entity.ts                 # ClientUser: register, replacePendingRegistration, verifyEmail (inmutable)
│  ├─ internal-user.entity.ts               # InternalUser: enroll, suspend, reactivate, setFirstPassword (011)
│  ├─ verification-token.entity.ts          # VerificationToken: issue, stateAt, isValid, consume, invalidate
│  ├─ email-address.vo.ts                   # EmailAddress.of: recorta y pasa a minúsculas (D-16)
│  ├─ opaque-token.vo.ts                    # OpaqueToken: 32 bytes base64url, SHA-256, comparación en tiempo constante
│  ├─ password-hash.vo.ts                   # PasswordHash: PHC opaco; toString/toJSON → '[REDACTED]'
│  ├─ legal-acceptance.vo.ts                # versiones de Términos y Privacidad + fecha de aceptación
│  ├─ account-status.enum.ts                # ACTIVE ('activa') | SUSPENDED ('suspendida')
│  ├─ client-account-verified.event.ts      # CLIENT_ACCOUNT_VERIFIED + ClientAccountVerifiedEvent { userId }
│  └─ errors/                               # IDENTITY_INVALID_INPUT, _WEAK_PASSWORD, _TOO_MANY_REQUESTS,
│                                           # _VERIFICATION_LINK_EXPIRED, _VERIFICATION_LINK_INVALID
├─ application/
│  ├─ ports/                                # ver «Puertos»
│  ├─ registration.service.ts               # RegistrationService: register, resendVerification, verifyEmail
│  ├─ verification-link-issuer.ts           # invalida los vigentes, emite el token y arma el correo del enlace
│  ├─ registration-attempt-notifier.ts      # aviso al dueño de un correo ya registrado (D-17, 1 cada 24 h)
│  ├─ auth.service.ts                       # AuthService: login (002)
│  ├─ session.service.ts                    # SessionService: open, refresh, logout, list, revoke, revokeOthers (002)
│  ├─ password.service.ts                   # PasswordService: requestReset, checkResetLink, resetPassword,
│  │                                        # changePassword (002)
│  ├─ account-token-lookup.ts               # findAccountToken: valor → token por hash y tipo (verificación, recuperación, alta)
│  ├─ account-token-issuer.ts               # issueAccountToken: invalida los vigentes y guarda solo el hash del nuevo
│  ├─ password-policy-issues.ts             # weakPasswordIssues: política D-6 con el correo de la cuenta → `fields`
│  ├─ account-directory.ts                  # AccountDirectory: list, get, findClientByEmail, statistics (011)
│  ├─ account-administration.ts             # AccountAdministration: lockAdminRoster, assertActorActive, suspend,
│  │                                        # reactivate (011)
│  ├─ internal-account-enrollment.ts        # InternalAccountEnrollment: enroll, enrollInitialAdmin (011)
│  ├─ account-setup-link-issuer.ts          # AccountSetupLinkIssuer: enlace `alta_interna` y su correo (011)
│  ├─ account-setup.service.ts              # AccountSetupService: checkLink, setFirstPassword (011)
│  ├─ identity-limit-keys.ts                # claves de límites y bloqueos (SHA-256 del correo o userId) y EMAIL_REQUEST_RULES
│  ├─ identity-config.ts  web-links.ts      # WEB_PUBLIC_URL y rutas de `web` que usan los correos
│  ├─ identity-logger.ts                    # interfaz mínima info/warn del logger (dobles en pruebas)
│  ├─ mail/                                 # plantillas (funciones puras): verificación, aviso de intento y, de 002,
│  │                                        # restablecer, contraseña cambiada, dispositivo nuevo y sesión cerrada
│  └─ testing/                              # dobles en memoria y builder de ClientUser para pruebas unitarias
├─ infrastructure/
│  ├─ persistence/                          # entidades ORM (usuario, token_cuenta, sesion, dispositivo), mappers y
│  │                                        # repositorios TypeORM
│  ├─ jwt/                                  # JwtTokenService (emite y verifica) y JwtStrategy (002)
│  ├─ redis-attempt-lockout.ts              # RedisAttemptLockout: bloqueos de login y cambio de contraseña (002)
│  ├─ argon2id.hasher.ts                    # Argon2idHasher (m=19456, t=2, p=1; RN-3)
│  └─ event-emitter-account-events.publisher.ts
├─ presentation/
│  ├─ auth.controller.ts                    # AuthController: register, resend-verification, verify-email (abre sesión),
│  │                                        # login, session/refresh, session/logout (002)
│  ├─ password.controller.ts                # PasswordController: forgot-password, reset-password/check, reset-password,
│  │                                        # change-password (002)
│  ├─ account-setup.controller.ts           # AccountSetupController: account-setup/check, account-setup (011)
│  ├─ sessions.controller.ts                # SessionsController: GET /sessions, DELETE /sessions/:id, revoke-others (002)
│  ├─ session-cookies.ts                    # SessionCookies (nimbo_rt, nimbo_did) y readCookie (002 DT-2, DT-9)
│  ├─ client-context.factory.ts             # readClientContext: nimbo_did, User-Agent y req.ip (002 CA-16)
│  ├─ session-response.ts                   # IssuedSession → SessionResponse del contrato
│  ├─ identity-ip-throttler.guard.ts        # IdentityIpThrottlerGuard + IDENTITY_THROTTLERS (register-ip, resend-ip, login-ip)
│  ├─ identity-validation.ts                # fábrica de errores de ZodValidationPipe (INVALID_INPUT o WEAK_PASSWORD)
│  └─ no-store.middleware.ts                # Cache-Control: no-store en toda respuesta de los cuatro controladores
├─ identity.module.ts                       # IdentityModule.forRoot(env)
└─ index.ts                                 # única API pública
```

## Puertos (Art. V.2)

Un puerto nuevo solo existe si cumple una regla del Art. V.2 de la constitución:

| Puerto                         | Adaptador                               | Regla                                                     |
| ------------------------------ | --------------------------------------- | --------------------------------------------------------- |
| `IUserRepository`              | `TypeormUserRepository`                 | (b) repositorio; está en el diagrama M1                   |
| `IVerificationTokenRepository` | `TypeormVerificationTokenRepository`    | (b) repositorio; 002 lo reutiliza (recuperación)          |
| `IPasswordHasher`              | `Argon2idHasher`                        | (a) aísla Argon2; está en el diagrama M1                  |
| `IAccountEventsPublisher`      | `EventEmitterAccountEventsPublisher`    | (a) aísla `@nestjs/event-emitter` (ADR-0019)              |
| `ISessionRepository`           | `TypeOrmSessionRepository`              | (b) repositorio; está en el diagrama M1 (002)             |
| `IDeviceRepository`            | `TypeOrmDeviceRepository`               | (b) repositorio de `dispositivo` (002, DF-11)             |
| `ITokenService`                | `JwtTokenService`                       | (a) aísla `@nestjs/jwt`; está en el diagrama M1           |
| `IAttemptLockout`              | `RedisAttemptLockout`                   | (a) aísla Redis (bloqueos por fallos, 002 D-5/D-7)        |
| `IAdminRosterRepository`       | `TypeormUserRepository` (`useExisting`) | (b) repositorio; padrón interno del backoffice (011, ISP) |
| `IAccountDirectoryRepository`  | `TypeOrmAccountDirectoryRepository`     | (b) modelo de lectura de cuentas del backoffice (011)     |

Consume `IMailer` (`notifications`) e `IRateLimiter`, `ITransactionRunner` e `IClock` (`shared`). La recuperación
(002) suma a `IUserRepository` `findById` y `updatePasswordHash`. `JwtTokenService` implementa además
`IAccessTokenVerifier`, el puerto de `shared` que declara 003 (`useExisting`): `identity` lo exporta como
`I_ACCESS_TOKEN_VERIFIER` y nadie importa `identity` para verificar un token.

## API pública (`index.ts`)

- `IdentityModule`: `AppModule` lo registra con `IdentityModule.forRoot(env)`, junto con
  `EventEmitterModule.forRoot()` y `ThrottlerModule.forRoot({ throttlers: [...IDENTITY_THROTTLERS] })`.
- `IDENTITY_THROTTLERS`: la lista de _throttlers_ de `identity` vive junto al guard y su tabla de ámbitos, así
  `AppModule` no repite nombres.
- `CLIENT_ACCOUNT_VERIFIED` y `ClientAccountVerifiedEvent`: el evento de cuenta de cliente verificada.
- Fachadas del backoffice (011 plan §2; clases sin interfaz, Art. V.2): `AccountDirectory`, `AccountAdministration` e
  `InternalAccountEnrollment`, con sus tipos. Corren dentro de la transacción del llamador; ni repositorios ni entidades
  salen del módulo.
- Errores que reutiliza el borde HTTP del backoffice (011 T-10): `ActorNotActiveError` (bitácora
  `backoffice.actor.inactive`), `AccountNotFoundError` (un `:id` que no es UUID da el mismo `404`) e
  `IdentityInvalidInputError` (`422` del alta). Así `backoffice` no repite los códigos de `identity`.

### Evento `CLIENT_ACCOUNT_VERIFIED` (ADR-0019)

`identity.client-account-verified` con `{ userId }`, sin correo ni nombre. `RegistrationService.verifyEmail` lo
publica **después del commit** y solo en la apertura que verifica: una vez por cuenta (CA-8, CA-29 d). Si un oyente
lanza, se registra `identity.account_verified.publish_failed` y la verificación sigue confirmada.

`billing` (006a) lo consume para crear la suscripción Personal. Es la **única importación permitida de `billing`
desde `identity`**: el nombre del evento y su tipo, nada más. El oyente debe ser idempotente y 006a agrega una
conciliación («toda cuenta `CLIENT` verificada sin suscripción recibe Personal») porque el evento en proceso puede
perderse.

## Sesiones (002)

- **Rutas** (todas `@Public()`): `POST /auth/login` (`200 SessionResponse`), `POST /auth/session/refresh` (`200
SessionResponse`, rota `nimbo_rt`) y `POST /auth/session/logout` (`204`). `verify-email` en su apertura `verified`
  abre sesión con `origin: 'verification'` y registra `identity.verification.session_opened`; si eso falla responde
  `verified` sin `session` y registra `identity.verification.session_failed`.
- **Revocar y después lanzar**: cuando un rechazo también escribe (reúso del token de refresco, cuenta suspendida),
  la transacción **devuelve** una decisión, se confirma, y recién entonces salen la bitácora, el correo y el error. Un
  `throw` dentro de la transacción haría _rollback_ de la revocación. Ambos casos registran `identity.session.revoked`
  (`reason: 'reuse' | 'suspended'`).
- **Cookies** (`session-cookies.ts`, única fuente): `nimbo_rt` (`HttpOnly`, `SameSite=Strict`,
  `Path=/api/v1/auth/session`, `Max-Age` = `refreshMaxAge`) y `nimbo_did` (`Path=/api/v1/auth`, 365 d, solo si el
  navegador no traía una válida). `Secure` solo con `APP_ENV` `staging` o `production` (`IDENTITY_CONFIG.cookieSecure`).
  `nimbo_rt` se borra ante `IDENTITY_SESSION_EXPIRED`, `IDENTITY_SESSION_REVOKED` y en `logout`; **nunca** ante
  `IDENTITY_REFRESH_INVALID` (carrera entre pestañas, CA-9).
- **Límites**: `login-ip` (20 intentos por IP en 15 min, ámbito `ip_login` con su propio texto, DT-20) y bloqueo por
  correo con `IAttemptLockout` (5 fallos en 15 min → 15 min). `register` y `resend-verification` omiten `login-ip`;
  `login` omite `register-ip` y `resend-ip`.
- **Token de acceso**: `JwtTokenService` (HS256, `sub`, `rol`, `sid`, 900 s) implementa `ITokenService` e
  `IAccessTokenVerifier` de `shared`; `IdentityModule` exporta `I_ACCESS_TOKEN_VERIFIER` y registra `JwtStrategy`
  con el nombre `ACCESS_TOKEN_STRATEGY`. Las apps de prueba que componen `IdentityModule` usan
  `accessTokenStrategy: 'identity'`.

## Recuperación de contraseña (002, PR-3)

- **Rutas** (todas `@Public()`, `PasswordController`): `POST /auth/forgot-password` (`202 { status: 'accepted' }`
  siempre), `POST /auth/reset-password/check` (`200`, revisa el enlace sin consumirlo, DT-12) y
  `POST /auth/reset-password` (`200`, no abre sesión y borra `nimbo_rt`).
- **Pedido neutro (CA-18)**: el límite `passwordResetRequestKey` (60 s y 5 por hora) se gasta **antes** de buscar la
  cuenta. Verificada, interna o suspendida (DT-6) → enlace de 1 h (el anterior queda invalidado). Sin verificar
  (D-15) → enlace de verificación nuevo con `VerificationLinkIssuer`, acotado **solo** por ese límite: no consulta ni
  gasta el de 001 (`emailRequestKey`), porque un `429` posterior en `resend-verification` delataría la cuenta (DT-7,
  SEC-1). Sin cuenta → nada.
- **Restablecer (CA-19 a CA-21)**: política D-6 de 001 con el correo de la cuenta (débil → el enlace sigue vigente);
  hash fuera de la transacción; consumo atómico del token, contraseña nueva y **todas** las sesiones revocadas en una
  transacción. Después del commit se quitan los dos bloqueos, el de inicio de sesión y el de cambio de contraseña
  (DT-5), y se envía «Tu contraseña cambió».
- **Bitácoras**: `identity.password_reset.requested` (`kind`: `reset_link`, `verification_link` o `ignored`, este
  sin `userId`), `identity.password_reset.rejected` (`reason`: `expired`, `invalid` o `weak`),
  `identity.password_reset.completed` (`revokedCount`), `identity.session.revoked` (`reason: 'password_reset'`) e
  `identity.rate_limited` (`scope: 'password_reset'`).
- **Pruebas**: `test/isolation/password-reset-enumeration.iso-spec.ts` compara las cuatro clases de cuenta, también
  con el límite agotado y en la secuencia `forgot-password` → `resend-verification`.

## Administración y alta interna (011)

- **Suspender y reactivar** (`AccountAdministration`): candado del padrón (`pg_advisory_xact_lock`) → no a
  sí mismo → fila `FOR UPDATE` → no al último Administrador activo → `suspendida` y **todas** sus sesiones revocadas
  (002 D-10). Reactivar no devuelve sesiones. `assertActorActive` lee el estado del actor en la transacción (RN-7).
- **Alta interna** (`InternalAccountEnrollment`): cuenta activa y verificada con el hash de un secreto aleatorio que
  nadie conoce, enlace `alta_interna` de 24 h (`ACCOUNT_SETUP_LINK_TTL_HOURS`, lo emite `AccountSetupLinkIssuer`, con
  la forma de `VerificationLinkIssuer`) y `deliverInvitation()`, que el llamador
  invoca **después** del commit. Si el correo falla, la cuenta queda y se registra `identity.invitation.mail_failed`
  (solo `userId`); la persona usa «¿Olvidaste tu contraseña?». Correo o código repetido → `IDENTITY_ENROLLMENT_CONFLICT`
  con uno o ambos `fields`. `enrollInitialAdmin` (CA-7) toma el candado y niega si ya hay un Administrador activo.
- **Primera contraseña** (`AccountSetupController` → `AccountSetupService`, `@Public()`, `no-store`): `POST /auth/account-setup/check` (`200`, sin consumir) y
  `POST /auth/account-setup` (`200 { status: 'password-set' }`): política D-6 con el correo de la cuenta, hash fuera de
  la transacción y consumo atómico del token; no crea ni revoca sesiones. Errores `IDENTITY_SETUP_LINK_INVALID`,
  `IDENTITY_SETUP_LINK_EXPIRED` e `IDENTITY_WEAK_PASSWORD`. Sin límite de tasa propio, como `reset-password` (PD-88).

## Seguridad: sesiones y cambio de contraseña (002, PR-4)

- **Rutas** (`@Roles(...ALL_ROLES)`: cada cuenta, cliente o interna, gestiona **solo** las suyas; el actor y «esta
  sesión» salen de `@CurrentActor()` y `@CurrentSessionId()`, nunca de `req.user`):
  - `GET /sessions` → `200 { items }`: sesiones activas (sin revocar, sin vencer y usadas en los últimos 7 días), la
    actual primero y después por `lastActiveAt`; como máximo 50. Solo navegador, sistema, tipo de dispositivo y
    fechas: sin IP, agente completo, hashes ni id del dispositivo (CA-11).
  - `DELETE /sessions/:id` → `204`; si es la actual, además borra `nimbo_rt`. Ajena, inexistente, ya revocada o `id`
    mal formado → el mismo `404 IDENTITY_SESSION_NOT_FOUND` (CA-12, 003 D-6). El dueño va en el `WHERE` del `UPDATE`
    (`revokeIfActive`), no se filtra después. El token de acceso de la sesión cerrada sigue valiendo hasta sus 15 min.
  - `POST /sessions/revoke-others` → `200 { revokedCount }`; la actual sigue abierta (CA-13).
  - `POST /auth/change-password` → `204` (CA-22, CA-23).
- **Cambio de contraseña**: primero se reserva el intento en `passwordChangeLockoutKey(userId)` con
  `reserveAttempt` (5 fallos en 15 min → 15 min): cuenta como fallo **antes** de verificar, en el mismo script atómico
  que `recordFailure`, así una ráfaga concurrente con un token robado no prueba más de 5 contraseñas (review I-1).
  Bloqueado → `429 IDENTITY_PASSWORD_CHANGE_LOCKED` aunque la actual sea correcta. Actual incorrecta → la reserva queda
  como fallo y `422 IDENTITY_WRONG_PASSWORD` con `fields: currentPassword` (también el quinto, que activa el bloqueo);
  la sesión nunca se cierra. Actual correcta → `clear` libera la reserva y los fallos previos, como el inicio de
  sesión. Nueva débil (política D-6 con el correo; también vacía) → `422 IDENTITY_WEAK_PASSWORD` sobre `newPassword`.
  Éxito: hash fuera de la transacción; en ella, `updatePasswordHash` + `revokeAllExcept(userId, sesiónActual)`;
  después del commit se envía «Tu contraseña cambió». Las políticas de bloqueo viven en `identity-limit-keys.ts`
  (`LOGIN_LOCKOUT_POLICY`, `PASSWORD_CHANGE_LOCKOUT_POLICY`).
- **Bitácoras**: `identity.session.revoked` (`reason`: `user`, `others` o `password_change`, con `count`),
  `identity.password.changed` (`revokedCount`), `identity.password_change.rejected` (`reason`: `wrong_password`,
  `weak` o `locked`) e `identity.lockout.engaged` (`scope: 'password_change'`). Nunca las contraseñas.
- **Pruebas**: `test/int/identity/{sessions,change-password,auth-logs,credential-secrecy}.int-spec.ts` y
  `test/isolation/sessions-isolation.iso-spec.ts` (tokens reales del mundo de 003: cada cuenta ve y cierra solo las
  suyas). `test/isolation/login-enumeration.iso-spec.ts` cubre la anti-enumeración del inicio de sesión (CA-2, CA-5).
  Desde 002 T-55 el mundo de aislamiento emite tokens reales con `JwtTokenService`.

## Reglas del módulo

- **Anti-enumeración (RN-5)**: registro y reenvío responden lo mismo exista o no la cuenta (`202`), el límite por
  correo va antes de cualquier consulta y el hash de Argon2id se calcula siempre. La suite
  `test/isolation/identity-enumeration.iso-spec.ts` compara status, cuerpos y cabeceras en los cuatro tipos de
  correo.
- **Secretos**: la contraseña se guarda como PHC de Argon2id y el token del enlace como SHA-256; el valor en claro
  solo vive en memoria y en el correo (CA-17, CA-19).
- **Después del commit**: los correos y el evento salen solo tras confirmar la transacción.
- **Bitácoras**: identifican la cuenta solo por `userId` (plan 001 §7); nunca correo, nombre, contraseña, token,
  hash ni la URL del enlace (CA-18).

## Qué reutilizan 002 y 003 (plan 001 §6.11)

- **002**:
  - `RegistrationService.verifyEmail` devuelve `{ outcome: 'VERIFIED', userId, user }` una sola vez por cuenta: ahí
    `AuthController.verifyEmail` abre la sesión (002 D-1, D-4) y extiende `VerifyEmailResponse`.
  - `IPasswordHasher`, `IUserRepository`, `IVerificationTokenRepository` (con `tipo = recuperacion`; un token de
    verificación nunca sirve para restablecer, CA-12) y `VerificationLinkIssuer` (002 D-15).
  - `IdentityIpThrottlerGuard`: 002-PR-2 agrega `login-ip` a `IDENTITY_THROTTLERS` y a la tabla de ámbitos.
  - `User.emailVerified` y `User.status` para `IDENTITY_EMAIL_NOT_VERIFIED` e `IDENTITY_ACCOUNT_SUSPENDED`.
  - `IRateLimiter` (`shared`) para sus límites por correo.
- **003**: `AuthController` es `@Public()` (fuera de los guards globales), no construye `Actor` y una cabecera
  `Authorization` se ignora (CA-7). El verificador token → `Actor` lo agrega 002 a
  `index.ts`.

## Pendientes

- **`nimbo_app`**: cuando 003 cree el rol de BD sin privilegios, la suite de aislamiento corre con él (ADR-0005).
- **Auditoría de seguridad de la recuperación (T-67)**, en `docs/sdd/pendientes.md`: `forgot-password` sin límite
  por IP (PD-50, SEC-2); unos 7 ms más de respuesta con cuenta que sin ella, riesgo aceptado (PD-51, SEC-3);
  `x-powered-by` y cabeceras de seguridad de la API (PD-52, SEC-5).

## Regla

Otros módulos importan **solo** desde `modules/identity/index.ts` (fachadas, puertos que este módulo implementa,
eventos y tipos públicos). Nada de `infrastructure/**` cruza la frontera. Nombres de clases y puertos: los de
`docs/sdd/design-model.md`.
