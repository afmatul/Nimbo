# `identity` — M1 · Identidad y Acceso

- **Dueño**: Juan Marcos (`specs/README.md`).
- **Diagrama de origen**: M1 en `docs/sdd/design-model.md` §3 y `docs/design/diagramas/`.
- **Responsabilidad**: Registro, verificación, login, refresh, sesiones y dispositivos.
- **Puede depender de**: shared, notifications, audit (`docs/sdd/architecture.md` §3; el lint de fronteras lo hace cumplir).
- **Specs que lo construyen**: 001 (registro y verificación del correo), 002 (autenticación, sesiones y dispositivos).
- **Decisiones**: ADR-0017 (`argon2` y `@nestjs/throttler`), ADR-0019 (eventos en proceso), ADR-0020 (validación con
  la fábrica de errores de cada módulo).

## Capas y clases (plan 001 §6.1)

```
modules/identity/
├─ domain/                                  # sin Nest, TypeORM, zod ni @nimbo/contracts (ADR-0008, regla 3)
│  ├─ user.entity.ts                        # User (abstracta)
│  ├─ client-user.entity.ts                 # ClientUser: register, replacePendingRegistration, verifyEmail (inmutable)
│  ├─ internal-user.entity.ts               # InternalUser: solo lectura en 001 (las crea 011)
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
│  ├─ password.service.ts                   # PasswordService: requestReset, checkResetLink, resetPassword (002)
│  ├─ account-token-lookup.ts               # findAccountToken: valor → token por hash y tipo (verificación y recuperación)
│  ├─ identity-limit-keys.ts                # claves de límites y bloqueos (SHA-256 del correo o userId) y EMAIL_REQUEST_RULES
│  ├─ identity-config.ts  web-links.ts      # WEB_PUBLIC_URL y rutas de `web` que usan los correos
│  ├─ identity-logger.ts                    # interfaz mínima info/warn del logger (dobles en pruebas)
│  ├─ mail/                                 # plantillas (funciones puras): verificación, aviso de intento y, de 002,
│  │                                        # restablecer, contraseña cambiada, dispositivo nuevo y sesión cerrada
│  └─ testing/                              # dobles en memoria y builder de ClientUser para pruebas unitarias
├─ infrastructure/
│  ├─ persistence/                          # usuario.orm-entity, token-cuenta.orm-entity, mappers y repositorios TypeORM
│  ├─ argon2id.hasher.ts                    # Argon2idHasher (m=19456, t=2, p=1; RN-3)
│  └─ event-emitter-account-events.publisher.ts
├─ presentation/
│  ├─ auth.controller.ts                    # AuthController: register, resend-verification, verify-email (abre sesión),
│  │                                        # login, session/refresh, session/logout (002)
│  ├─ password.controller.ts                # PasswordController: forgot-password, reset-password/check, reset-password
│  ├─ session-cookies.ts                    # SessionCookies (nimbo_rt, nimbo_did) y readCookie (002 DT-2, DT-9)
│  ├─ client-context.factory.ts             # readClientContext: nimbo_did, User-Agent y req.ip (002 CA-16)
│  ├─ session-response.ts                   # IssuedSession → SessionResponse del contrato
│  ├─ identity-ip-throttler.guard.ts        # IdentityIpThrottlerGuard + IDENTITY_THROTTLERS (register-ip, resend-ip, login-ip)
│  ├─ identity-validation.ts                # fábrica de errores de ZodValidationPipe (INVALID_INPUT o WEAK_PASSWORD)
│  └─ no-store.middleware.ts                # Cache-Control: no-store en toda respuesta de AuthController
├─ identity.module.ts                       # IdentityModule.forRoot(env)
└─ index.ts                                 # única API pública
```

## Puertos (Art. V.2)

Un puerto nuevo solo existe si cumple una regla del Art. V.2 de la constitución:

| Puerto                         | Adaptador                            | Regla                                            |
| ------------------------------ | ------------------------------------ | ------------------------------------------------ |
| `IUserRepository`              | `TypeormUserRepository`              | (b) repositorio; está en el diagrama M1          |
| `IVerificationTokenRepository` | `TypeormVerificationTokenRepository` | (b) repositorio; 002 lo reutiliza (recuperación) |
| `IPasswordHasher`              | `Argon2idHasher`                     | (a) aísla Argon2; está en el diagrama M1         |
| `IAccountEventsPublisher`      | `EventEmitterAccountEventsPublisher` | (a) aísla `@nestjs/event-emitter` (ADR-0019)     |

Consume `IMailer` (`notifications`) e `IRateLimiter`, `ITransactionRunner` e `IClock` (`shared`). La recuperación
(002) suma a `IUserRepository` `findById` y `updatePasswordHash`.

## API pública (`index.ts`)

- `IdentityModule`: `AppModule` lo registra con `IdentityModule.forRoot(env)`, junto con
  `EventEmitterModule.forRoot()` y `ThrottlerModule.forRoot({ throttlers: [...IDENTITY_THROTTLERS] })`.
- `IDENTITY_THROTTLERS`: la lista de _throttlers_ de `identity` vive junto al guard y su tabla de ámbitos, así
  `AppModule` no repite nombres.
- `CLIENT_ACCOUNT_VERIFIED` y `ClientAccountVerifiedEvent`: el evento de cuenta de cliente verificada.

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
  abre sesión con `origin: 'verification'`; si eso falla responde `verified` sin `session` y registra
  `identity.verification.session_failed`.
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
