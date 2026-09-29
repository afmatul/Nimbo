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
│  ├─ identity-config.ts  web-links.ts      # WEB_PUBLIC_URL y rutas de `web` que usan los correos
│  ├─ identity-logger.ts                    # interfaz mínima info/warn del logger (dobles en pruebas)
│  ├─ mail/                                 # plantillas de verificación y de aviso de intento (funciones puras)
│  └─ testing/                              # dobles en memoria y builder de ClientUser para pruebas unitarias
├─ infrastructure/
│  ├─ persistence/                          # usuario.orm-entity, token-cuenta.orm-entity, mappers y repositorios TypeORM
│  ├─ argon2id.hasher.ts                    # Argon2idHasher (m=19456, t=2, p=1; RN-3)
│  └─ event-emitter-account-events.publisher.ts
├─ presentation/
│  ├─ auth.controller.ts                    # AuthController: register, resend-verification, verify-email
│  ├─ identity-ip-throttler.guard.ts        # IdentityIpThrottlerGuard + IDENTITY_THROTTLERS (register-ip y resend-ip, D-8, D-15)
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

Consume `IMailer` (`notifications`) e `IRateLimiter`, `ITransactionRunner` e `IClock` (`shared`).

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
  - `RegistrationService.verifyEmail` devuelve `{ outcome: 'VERIFIED', userId }` una sola vez por cuenta: ahí
    `AuthController.verifyEmail` abrirá la sesión (002 D-1, D-4) y extenderá `VerifyEmailResponse`.
  - `IPasswordHasher`, `IUserRepository`, `IVerificationTokenRepository` (con `tipo = recuperacion`; un token de
    verificación nunca sirve para restablecer, CA-12) y `VerificationLinkIssuer` (002 D-15).
  - `IdentityIpThrottlerGuard`: 002-PR-2 agrega `login-ip` a `IDENTITY_THROTTLERS` y a la tabla de ámbitos.
  - `User.emailVerified` y `User.status` para `IDENTITY_EMAIL_NOT_VERIFIED` e `IDENTITY_ACCOUNT_SUSPENDED`.
  - `IRateLimiter` (`shared`) para sus límites por correo.
- **003**: `AuthController` no construye `Actor` y una cabecera `Authorization` se ignora (CA-7). El verificador
  token → `Actor` lo agrega 002 a `index.ts`.

## Pendientes

- **`@Public()` con 003**: cuando 003 instale el guard global de autenticación, las tres rutas de `AuthController`
  se marcan `@Public()`.
- **`@SkipThrottle` con 002**: `register` ya omite `resend-ip` y `resend-verification` omite `register-ip`. Cuando
  002-PR-2 agregue el _throttler_ `login-ip`, `register` y `resend-verification` omiten también `login-ip`, y `login`
  omite `register-ip` y `resend-ip`, sin renombrar nada (002 D-5).
- **`nimbo_app`**: cuando 003 cree el rol de BD sin privilegios, la suite de aislamiento corre con él (ADR-0005).

## Regla

Otros módulos importan **solo** desde `modules/identity/index.ts` (fachadas, puertos que este módulo implementa,
eventos y tipos públicos). Nada de `infrastructure/**` cruza la frontera. Nombres de clases y puertos: los de
`docs/sdd/design-model.md`.
