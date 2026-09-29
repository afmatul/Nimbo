# Plan 001 — Registro de cuenta de cliente y verificación de correo

> Spec: `./spec.md` (Aclarada, 2026-09-26) · Estado del plan: **Aprobado** (`architect`, segunda revisión, 2026-09-27;
> ADR-0017 a ADR-0020 aceptados y P-1, P-2, P-5 y P-7 resueltos por Adrián el 2026-09-27)

## 1. Resumen técnico

El alta de clientes vive en `identity` (M1) con capas `domain → application → infrastructure → presentation`.
`AuthController` expone tres rutas públicas (`register`, `verify-email`, `resend-verification`) y delega en
`RegistrationService`, que orquesta los puertos `IUserRepository`, `IVerificationTokenRepository`, `IPasswordHasher`
(→ `Argon2idHasher`), `IRateLimiter` (de `shared`), `IMailer` (de `notifications`), `IClock` y un publicador del
evento `ClientAccountVerified`. El dominio (`ClientUser`, `VerificationToken`, `EmailAddress`, `OpaqueToken`) fija
las invariantes: correo normalizado (D-16), token opaco de 256 bits guardado como SHA-256 (D-19), un solo uso con
consumo atómico, un solo token vigente por cuenta. La validación de entrada es **un solo esquema zod** en
`packages/contracts` (política D-6 incluida) que usan el formulario de `web` y un `ZodValidationPipe` de `shared`
(CA-22). El correo sale por `IMailer` → `SmtpMailer`, que encola en la cola `mail`; el `worker` lo entrega con
nodemailer (Mailpit en local, SMTP de Resend en staging), con 5 reintentos e idempotencia por clave del trabajo.
`shared` agrega `IRateLimiter` → `RedisRateLimiter` (límites por correo, D-8), `TooManyRequestsError` (429 con
`Retry-After`), un ejecutor de transacciones y la configuración HTTP común (CORS, `trust proxy`, solo JSON). El límite
por IP usa `@nestjs/throttler`. Dos migraciones crean `usuario` y `token_cuenta`. `web` agrega registro, «Revisa tu
correo», pedir enlace, verificación (el token viaja en el **fragmento** `#token=`, que nunca llega a un servidor),
Términos y Privacidad. El backend no espera a 006a: publica el evento aunque nadie lo escuche todavía y la pantalla de
registro cae a `catalogo-no-disponible` si el catálogo no existe.

## 2. Verificación contra la constitución

| Artículo | Cumple | Nota |
|---|---|---|
| I Spec manda | ☑ | Cada decisión cita su CA o D-n. Lo que la spec no decidió está en §10.2 (decisiones técnicas) o §10.3 (preguntas). |
| IV SOLID | ☑ | S: `RegistrationService` orquesta; `VerificationLinkIssuer` emite enlaces; `RegistrationAttemptNotifier` aplica D-17; `Argon2idHasher`, `RedisRateLimiter` y `SmtpMailer` tienen una razón de cambio cada uno. I: `IMailer` solo con `send`; `IRateLimiter` solo con `consume`. D: la aplicación depende de puertos; nodemailer, argon2, ioredis, TypeORM y EventEmitter2 quedan en `infrastructure`. L: pruebas de contrato para `IPasswordHasher`, `IRateLimiter` e `IMailer`. |
| V YAGNI — abstracciones nuevas | ☑ | Ver §6.3: `IVerificationTokenRepository` (regla b), `IAccountEventsPublisher` (regla a: aísla el mecanismo de eventos, que ADR-0019 puede cambiar), `ITransactionRunner` (regla a: aísla TypeORM; 003 lo reutiliza con `withActor`). No se crea puerto para el generador de tokens (usa `node:crypto` en dominio), ni para plantillas de correo, ni capa genérica de eventos. |
| VI DRY | ☑ | Un solo esquema de registro y una sola política de contraseña (`packages/contracts`) para `web` y `api`, y 002 la reutiliza al restablecer. Parámetros de §6 de la spec en un solo archivo. `REDACTED_FIELDS` sigue siendo la única lista. `VerificationLinkIssuer` lo usan registro, reenvío y 002 D-15. La configuración HTTP de `main.ts` y del arnés de pruebas sale de una sola función. |
| VIII Fronteras | ☑ con arista nueva | `identity → shared, notifications` (permitidas). Arista nueva **aceptada** por ADR-0019: `billing → identity`, restringida a contratos de eventos (`CLIENT_ACCOUNT_VERIFIED` y `ClientAccountVerifiedEvent` desde `identity/index.ts`, §3b). No crea ciclo; `boundaries.js` la codifica en PD-38. |
| IX Seguridad — `actor`/`accessibleNodes` | ☑ (n/a con razón) | Las tres operaciones son anónimas y no devuelven datos de ninguna cuenta (spec §10), así que no reciben `actor`. Tokens y contraseñas solo como hash; anti-enumeración por construcción (§7b). |
| X Operabilidad | ☑ | Eventos de bitácora de §7 con `correlationId`, también en el trabajo de correo del `worker`. Métricas Prometheus: 022 (RNF-18, la spec solo declara eventos). |
| XI Integridad | ☑ | Emisión de token y cambios de cuenta en una transacción con la fila de `usuario` bloqueada; consumo del token con `UPDATE … WHERE usado_en IS NULL`; trabajo de correo idempotente (clave del trabajo + marca en Redis). |
| XII Degradación | ☑ | Si el SMTP cae, el registro responde igual y el `worker` reintenta (CA-21). Si el catálogo de 006a no responde, el registro sigue con Personal (CA-22). Si nadie escucha el evento, la verificación funciona igual. |

## 3. Coherencia con los diagramas

| Diagrama | Clases / tablas usadas | ¿Se aparta del diagrama? | Acción |
|---|---|---|---|
| Clases M1 | `AuthController` (register, verifyEmail), `IUserRepository`, `IPasswordHasher` → `Argon2idHasher`, `User` ← `ClientUser`, `InternalUser`, `VerificationToken` (`consume()`, `isValid()`), `Role` (de `shared`) | Sí: (1) `RegistrationService` nuevo en lugar de poner el alta en `AuthService` (§10.2 DT-1); (2) `AuthController.resendVerification` nuevo; (3) puertos nuevos `IVerificationTokenRepository` e `IAccountEventsPublisher`; (4) objetos de valor `EmailAddress`, `OpaqueToken`, `PasswordHash`, `LegalAcceptance`; (5) `ClientUser` sin `subscriptionId` (DF-35, ya aceptado) | **DF-54** (`Aceptado`); `design-model.md` M1 ya actualizado; redibujo en PD-06 y PD-36 |
| Clases T1 `shared` | `IRateLimiter` → `RedisRateLimiter`, `IClock`, `DomainError` | Sí: `TooManyRequestsError` (429), `FieldIssue`, `ITransactionRunner` + `TransactionContext`, `ZodValidationPipe`, `configureHttpApp`, proveedor `REDIS_CLIENT` | **DF-54**; `design-model.md` T1 y `architecture.md` §3 ya actualizados |
| Clases T4 `notifications` | `IMailer` → `SmtpMailer` | Sí: `MailProcessor` («processor», en el `worker») y `SmtpTransport` (envoltorio de nodemailer). La tabla `notificacion` **no** se crea (spec §12: solo correo) | **DF-54**; `design-model.md` T4 ya actualizado |
| E-R usuarios | `usuario`, `token_cuenta` | Sí: `usuario` sin tabla `rol` y con `rol`, `correo_verificado`, `version_terminos`, `version_privacidad`, `terminos_aceptados_en` (D-1, D-3, D-14; ya previstos en PD-06). `token_cuenta` con `usuario_id` explícito y dos columnas nuevas: `invalidado_en` y `creado_en` (§4) | E-R en PD-06; columnas nuevas de `token_cuenta` en **DF-53** (`Aceptado`, §10.2 DT-4) |
| Arquitectura §3/§8 | Cola `mail` (5 reintentos) | Sí: la idempotencia de `mail` era «por `notificacion.id`», pero 001 no usa `notificacion`: pasa a «por clave de idempotencia del trabajo» (ADR-0018) | `architecture.md` §8 ya actualizado |
| Arquitectura §3 | `identity → shared, notifications` | Arista nueva `billing → identity`, aceptada por ADR-0019 y restringida a contratos de eventos | Ya reflejada en `architecture.md` §3; `boundaries.js` en PD-38 |

Hallazgos `DF-xx` que esta spec resuelve o de los que depende:

- **DF-13, DF-35, DF-33 (`usuario`)**: `Aceptado` (PD-09). Este plan los aplica tal cual; falta el redibujo (PD-06).
- **DF-34**: `Aceptado` (ADR-0010). `notifications` declara e implementa `IMailer`.
- **DF-01**: no aplica a estas operaciones anónimas (spec §10).
- **DF-10 / PD-20**: `sharing` necesitará `IPasswordHasher` en 012. Este plan deja `Argon2idHasher` en
  `identity/infrastructure` como dice el diagrama; si PD-20 decide moverlo a `shared`, se mueve sin cambiar su
  contrato. No bloquea 001.
- **DF-11, DF-15 (sesiones)**: son de 002. Este plan no crea `dispositivo` ni `sesion`.
- **DF-53** (`Aceptado` con la aprobación de este plan): columnas `invalidado_en` y `creado_en` de `token_cuenta` (§4,
  §10.2 DT-4).
- **DF-54** (`Aceptado` con la aprobación de este plan): clases nuevas o movidas de M1, T1 y T4 (`RegistrationService`,
  `resendVerification`, `IVerificationTokenRepository`, `IAccountEventsPublisher`, objetos de valor,
  `TooManyRequestsError`, `ITransactionRunner`, `MailProcessor`…). Redibujo en PD-06 y PD-36.

## 3b. Módulos afectados

| Módulo | Cambio | Capa(s) |
|---|---|---|
| `identity` (nuevo) | `ClientUser`, `InternalUser`, `User`, `VerificationToken`, objetos de valor y errores; `RegistrationService`, `VerificationLinkIssuer`, `RegistrationAttemptNotifier`, plantillas de correo; repositorios TypeORM, `Argon2idHasher`, `EventEmitterAccountEventsPublisher`; `AuthController`, `IdentityIpThrottlerGuard`; `identity.module.ts`; `index.ts` exporta `IdentityModule` y, como contratos de eventos, solo `CLIENT_ACCOUNT_VERIFIED` (constante con el nombre) y `ClientAccountVerifiedEvent` (tipo `{ readonly userId: string }`) | todas |
| `notifications` (nuevo) | `IMailer` + `MailMessage` (puerto), `SmtpMailer` (encola), `MailProcessor` y `SmtpTransport` (worker); `NotificationsModule` (api) y `NotificationsWorkerModule` (worker) | application, infrastructure |
| `shared` | `IRateLimiter` → `RedisRateLimiter` (Lua atómico); `TooManyRequestsError`; `DomainError.fields` opcional y `Retry-After` en `DomainExceptionFilter`; `ITransactionRunner` + `TransactionContext`; `ZodValidationPipe`; `configureHttpApp`; `REDIS_CLIENT`; `I_CLOCK` provisto; `REDACTED_FIELDS` + `email`, `correo`, `fullName`, `to`, `html`, `text`; `enqueueWithCorrelation` acepta opciones del trabajo; esquemas de entorno | domain, application, infrastructure, presentation |
| `packages/contracts` | raíz: `error.ts` con `fields` opcional y `validation.ts` (`toFieldIssues` genérica); carpeta `identity/` (esquemas, política de contraseña, lista de contraseñas comunes, parámetros, códigos de error y `reason`, mensajes de campo, versiones de Términos y Privacidad) | contratos |
| composición | `AppModule` (Identity, Notifications, `ThrottlerModule`, `EventEmitterModule`), `WorkerModule` (cola `mail`), `main.ts` y arnés de pruebas vía `configureHttpApp` | composición |
| `apps/web` | rutas públicas de registro, pedir enlace, verificación, Términos, Privacidad y marcador de inicio de sesión; `features/identity/`; cliente HTTP y catálogo de errores | presentación |
| `compose.override.yml`, `.env.example`, `scripts/check-env-example.ts` | `SMTP_HOST=mailpit` para el `worker` del perfil `apps`; variables nuevas (§6.10) | operación |

Dependencias nuevas entre módulos:

- `identity → notifications` (`IMailer`) e `identity → shared` (`IRateLimiter`, `ITransactionRunner`, `IClock`): ya
  permitidas por ADR-0010.
- **Decidida (ADR-0019):** `billing → identity`, **restringida a contratos de eventos**: 006a solo puede importar de
  `identity/index.ts` la constante `CLIENT_ACCOUNT_VERIFIED` y el tipo `ClientAccountVerifiedEvent`, nunca
  fachadas, puertos ni entidades. `identity` no depende de `billing`, así que no hay ciclo. `boundaries.js` agrega
  la arista y el *fixture* negativo `identity-imports-billing.ts` en PD-38.

## 4. Modelo de datos

Dos migraciones, una por cambio lógico, escritas a mano (ADR-0002), en `apps/api/src/migrations/`:

```sql
-- 20260928100000-crear-usuario.ts  (up)
CREATE TABLE usuario (
  id                    uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                varchar(100) NOT NULL,
  correo                varchar(254) NOT NULL,
  hash_clave            varchar(255) NOT NULL,
  rol                   varchar(16)  NOT NULL,
  estado                varchar(16)  NOT NULL DEFAULT 'activa',
  correo_verificado     boolean      NOT NULL DEFAULT false,
  version_terminos      varchar(20)  NULL,
  version_privacidad    varchar(20)  NULL,
  terminos_aceptados_en timestamptz  NULL,
  creado_en             timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT ck_usuario_rol    CHECK (rol IN ('CLIENT', 'ADMIN', 'SUPPORT', 'OPERATOR')),      -- D-1
  CONSTRAINT ck_usuario_estado CHECK (estado IN ('activa', 'suspendida')),                     -- D-3 (c)
  CONSTRAINT ck_usuario_correo_normalizado CHECK (correo = lower(btrim(correo))),              -- D-16
  CONSTRAINT ck_usuario_nombre CHECK (char_length(btrim(nombre)) BETWEEN 1 AND 100),           -- D-5
  CONSTRAINT ck_usuario_aceptacion_cliente CHECK (                                              -- D-14, RN-12
    rol <> 'CLIENT'
    OR (version_terminos IS NOT NULL AND version_privacidad IS NOT NULL AND terminos_aceptados_en IS NOT NULL)
  )
);
CREATE UNIQUE INDEX uq_usuario_correo ON usuario (correo);                                     -- RN-2, CA-3
-- down
DROP TABLE usuario;
```

```sql
-- 20260928100100-crear-token-cuenta.ts  (up)
CREATE TABLE token_cuenta (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id    uuid        NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
  tipo          varchar(16) NOT NULL,
  token_hash    char(64)    NOT NULL,              -- SHA-256 en hex del token opaco (D-19)
  expira_en     timestamptz NOT NULL,
  usado_en      timestamptz NULL,
  invalidado_en timestamptz NULL,                  -- nuevo respecto del E-R (DF-53)
  creado_en     timestamptz NOT NULL,              -- nuevo respecto del E-R; lo escribe la app con IClock
  CONSTRAINT ck_token_cuenta_tipo     CHECK (tipo IN ('verificacion', 'recuperacion')),
  CONSTRAINT ck_token_cuenta_hash     CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_token_cuenta_vigencia CHECK (expira_en > creado_en),
  CONSTRAINT ck_token_cuenta_un_final CHECK (usado_en IS NULL OR invalidado_en IS NULL)
);
CREATE UNIQUE INDEX uq_token_cuenta_token_hash ON token_cuenta (token_hash);
CREATE UNIQUE INDEX uq_token_cuenta_vigente ON token_cuenta (usuario_id, tipo)
  WHERE usado_en IS NULL AND invalidado_en IS NULL;                                           -- RN-4: uno vigente
CREATE INDEX idx_token_cuenta_usuario_id ON token_cuenta (usuario_id);                         -- FK y cascada
-- down
DROP TABLE token_cuenta;
```

- **Qué no entra**: la tabla `rol` (D-1), `codigo_empleado` (D-3, llega con 011), `espacio_usado` (DF-38, llega con
  005/007), `dispositivo` y `sesion` (002), `notificacion` (spec §12), `actualizado_en` (el E-R no la tiene y ninguna
  regla la necesita).
- **Tipo `recuperacion` en el `CHECK`**: el modelo ya fija `tipo = verificación / recuperación` (`design-model.md` §4)
  y 002 D-6 lo usa la semana siguiente. Incluirlo ahora evita reescribir la restricción; ningún código de 001 emite
  ese tipo.
- **Fechas**: toda fecha de negocio (`creado_en`, `expira_en`, `usado_en`, `invalidado_en`, `terminos_aceptados_en`)
  la escribe la aplicación con `IClock`, nunca `now()` de la BD, para que `FixedClock` controle CA-1 y CA-9. El
  `DEFAULT now()` de `usuario.creado_en` es solo un respaldo para inserciones de prueba de cuentas internas.
- **Hash de contraseña**: `varchar(255)` guarda el formato PHC (`$argon2id$v=19$m=…,t=…,p=…$sal$hash`, ~97 caracteres).
- **Índices**: `uq_usuario_correo` sostiene la búsqueda por correo y la unicidad bajo concurrencia (CA-3);
  `uq_token_cuenta_token_hash` sostiene la búsqueda por hash (CA-8 a CA-11); `uq_token_cuenta_vigente` garantiza un
  solo enlace vigente por cuenta y tipo (D-19, RN-4) como segunda barrera del bloqueo de fila.
- **RLS**: ninguna. ADR-0005 la limita a `archivo`, `version_archivo` y `fragmento`; `usuario` y `token_cuenta` no son
  contenido y ningún rol interno tiene ruta para leerlos en 001. Cuando 003 cree `nimbo_app` (PD-25), su migración o
  su script de inicio concede `SELECT, INSERT, UPDATE` sobre ambas tablas (sin `DELETE`): pendiente **PD-39**, que se
  resuelve en el plan de 003.
- **Migración reversible**: cada `down` borra su tabla. `token_cuenta` se revierte primero por el orden LIFO de
  TypeORM. El job `migrations` de CI (000 CA-11) ejecuta `run → revert → run` cuando exista; hasta el 30/09 se
  prueba en local con `pnpm --filter api migration:run` y `migration:revert` (workflow §7.2).
- `synchronize: false` sigue siendo literal (000 CA-10). Las entidades TypeORM viven en
  `modules/identity/infrastructure/persistence/*.orm-entity.ts`, así que el glob de la CLI las encuentra.

## 5. Contratos

### HTTP

Prefijo `/api/v1`. Las tres rutas son públicas (anónimas); cuando 003 instale los guards globales, llevarán
`@Public()` (003 CA-3 ya las lista). Todas responden con `Cache-Control: no-store`. Solo aceptan
`Content-Type: application/json` (§6.7).

| Método | Ruta | Rol | Request (`packages/contracts`) | Respuesta | Errores |
|---|---|---|---|---|---|
| POST | `/api/v1/auth/register` | público | `RegisterRequest` `{ fullName, email, password, acceptTerms: true }`, objeto **estricto** | `202` `AcceptedResponse` `{ "status": "accepted" }` | `422 IDENTITY_INVALID_INPUT`, `422 IDENTITY_WEAK_PASSWORD`, `429 IDENTITY_TOO_MANY_REQUESTS` (+ `Retry-After`), `400 VALIDATION_FAILED` (JSON mal formado, 000), `500 INTERNAL_ERROR` |
| POST | `/api/v1/auth/resend-verification` | público | `ResendVerificationRequest` `{ email }`, estricto | `202` `AcceptedResponse` (mismo cuerpo) | `422 IDENTITY_INVALID_INPUT`, `429 IDENTITY_TOO_MANY_REQUESTS`, `400`, `500` |
| POST | `/api/v1/auth/verify-email` | público | `VerifyEmailRequest` `{ token }`, estricto | `200` `VerifyEmailResponse` `{ "status": "verified" }` o `{ "status": "already-verified" }` | `422 IDENTITY_VERIFICATION_LINK_EXPIRED`, `422 IDENTITY_VERIFICATION_LINK_INVALID`, `400`, `500` |

**Respuesta neutra** (spec §7): `register` y `resend-verification` devuelven siempre `202 { "status": "accepted" }`
con las mismas cabeceras en los cuatro casos de cuenta (nueva, no verificada, verificada, interna). Para lograrlo:
no se envían `Set-Cookie`, el throttler no agrega cabeceras `X-RateLimit-*` (§6.5), y la validación y los límites
por correo se aplican **antes** de consultar si el correo existe (CA-5, CA-6, CA-15).

**Verificación por `POST` y no por `GET`**: el enlace del correo apunta a la página de `web`
(`{WEB_PUBLIC_URL}/verificar-correo#token=<token>`), que lee el fragmento en el navegador y lo manda en el cuerpo. Ni
el token ni la URL completa llegan a Next.js, a Traefik ni a las bitácoras de `api` (RN-8, CA-23).

Códigos de error (`packages/contracts/src/identity/error-codes.ts`; clases en `identity/domain/errors/`):

| `code` | HTTP | Clase base (`shared`) | Mensaje (español, con acción) | CA |
|---|---|---|---|---|
| `IDENTITY_INVALID_INPUT` | 422 | `InvalidInputError` | «Revisa los campos marcados y corrígelos para continuar.» + `fields` | CA-6, CA-7 |
| `IDENTITY_WEAK_PASSWORD` | 422 | `InvalidInputError` | «Tu contraseña no cumple estos requisitos: {lista}. Elige otra que los cumpla.» + `fields` | CA-5 |
| `IDENTITY_TOO_MANY_REQUESTS` | 429 | `TooManyRequestsError` (nueva) | «Ya te enviamos un enlace hace poco. Revisa tu bandeja y la carpeta de spam, o inténtalo de nuevo en N minutos.» | CA-15 |
| `IDENTITY_VERIFICATION_LINK_EXPIRED` | 422 | `InvalidInputError` | «Este enlace venció. Pide uno nuevo y ábrelo en las próximas 24 horas.» | CA-9 |
| `IDENTITY_VERIFICATION_LINK_INVALID` | 422 | `InvalidInputError` | «Este enlace no es válido. Usa el enlace del correo más reciente o pide uno nuevo.» | CA-11 |

- `IDENTITY_EMAIL_NOT_VERIFIED` (CA-16) lo define y lanza 002 en el inicio de sesión; 001 no lo usa.
- **`fields`** (cambio aditivo al contrato de 000): `ErrorResponse` admite `fields?: { field: string; reason: string;
  message: string }[]`, presente solo en errores de entrada. El esquema sigue siendo `.strict()` y un error sin
  `fields` sigue idéntico al de 000 CA-16. En la raíz de `contracts` (`error.ts`), `reason` es genérico: cualquier
  código `SCREAMING_SNAKE`; ningún módulo fija ahí su lista. Para `identity`, `reason` sale de un conjunto cerrado
  declarado en `contracts/identity/error-codes.ts`: `REQUIRED`, `TOO_LONG`,
  `INVALID_EMAIL`, `UNKNOWN_FIELD`, `TERMS_NOT_ACCEPTED`, `PASSWORD_TOO_SHORT`, `PASSWORD_TOO_LONG`,
  `PASSWORD_MISSING_UPPERCASE`, `PASSWORD_MISSING_NUMBER`, `PASSWORD_MISSING_SYMBOL`, `PASSWORD_COMMON`,
  `PASSWORD_EQUALS_EMAIL`. Los mensajes por `reason` viven en `contracts` (`IDENTITY_FIELD_MESSAGES`) y los usan el
  `api` y el catálogo de errores de `web` (Art. VI).
- **Cuál de los dos 422**: si el único campo inválido es `password`, `IDENTITY_WEAK_PASSWORD`; si hay más de uno,
  `IDENTITY_INVALID_INPUT` con todos, incluidas las reglas de contraseña. Así la respuesta nombra **cada** campo y
  **cada** regla (CA-5, CA-6).
- **CA-7**: los campos no declarados (`rol`, `role`, `correoVerificado`, `estado`, `version`, `plan`, `planId`…) se
  **rechazan** con `IDENTITY_INVALID_INPUT` y `reason = UNKNOWN_FIELD` (`z.object(...).strict()`). La cabecera
  `Authorization`, si llega, se ignora: las rutas no construyen `Actor`.
- **Token mal formado** (vacío, largo distinto de 43, caracteres fuera de base64url): `IDENTITY_VERIFICATION_LINK_INVALID`,
  no `IDENTITY_INVALID_INPUT`, porque CA-11 (b) lo pide así.
- **Estados HTTP**: ambos errores del enlace usan `422`, como toda regla de entrada de `shared` (no se agrega una
  clase `410`). `already-verified` es `200` porque la página lo muestra sin error rojo (CA-10).

Archivos de contrato en la **raíz** de `packages/contracts/src/` (genéricos, sin conocimiento de ningún módulo):

| Archivo | Contenido |
|---|---|
| `error.ts` | `errorResponseSchema` con `fields?` opcional; `reason` como código `SCREAMING_SNAKE` genérico |
| `validation.ts` (nuevo) | `toFieldIssues(zodError): { field, reason, message }[]` genérica: toma `reason` de `params.reason` del *issue* (o `REQUIRED`/`INVALID` por defecto) y el `message` del *issue*. La usan el `ZodValidationPipe` de `shared` y el formulario de `web` |

Archivos de contrato de `identity` (`packages/contracts/src/identity/`, una sola dueña: esta spec; `index.ts` los reexporta):

| Archivo | Contenido |
|---|---|
| `schemas.ts` | `registerRequestSchema`, `resendVerificationRequestSchema`, `verifyEmailRequestSchema`, `acceptedResponseSchema`, `verifyEmailResponseSchema`; cada regla fija su `params.reason` y su mensaje desde `IDENTITY_FIELD_MESSAGES` |
| `password-policy.ts` | `evaluatePassword(password, email): PasswordRuleResult[]` (pura, sin zod), usada por el esquema y por los requisitos en vivo de `web` |
| `common-passwords.ts` | lista local generada (§6.2) |
| `parameters.ts` | valores de §6 de la spec: `VERIFICATION_LINK_TTL_HOURS = 24`, `EMAIL_REQUEST_COOLDOWN_SECONDS = 60`, `EMAIL_REQUESTS_PER_HOUR = 5`, `REGISTRATIONS_PER_IP_PER_HOUR = 10`, `MAX_AVISOS_INTENTO_24H = 1`, `FULL_NAME_MAX_LENGTH = 100`, `PASSWORD_MIN_LENGTH = 12`, `PASSWORD_MAX_LENGTH = 128` |
| `legal.ts` | `LEGAL_DOCUMENTS = { terms: { version, effectiveDate }, privacy: { version, effectiveDate } }`: fuente única de la versión que guarda el servidor (CA-1) y que muestran las páginas (CA-23) |
| `error-codes.ts` | `IDENTITY_ERROR_CODES`, `FIELD_ISSUE_REASONS`, `IDENTITY_FIELD_MESSAGES` |

### Eventos

| Evento | Productor | Consumidores | Payload |
|---|---|---|---|
| `identity.client-account-verified` (nombre en la constante `CLIENT_ACCOUNT_VERIFIED`; tipo `ClientAccountVerifiedEvent = { readonly userId: string }`; ambos, y nada más, exportados por `identity/index.ts`) | `RegistrationService.verifyEmail`, **después del commit** y solo en la apertura que verifica (CA-8, CA-29 d) | `billing` (006a): crea la suscripción Personal. Debe ser idempotente (una suscripción vigente por cuenta) | `{ userId: string }` (sin correo ni nombre, CA-8) |
| Cola BullMQ `mail`, trabajo `send` | `SmtpMailer.send` (`api`) | `MailProcessor` (`worker`) | `MailJobData = MailMessage & { correlationId }`. `jobId` = `MailMessage.idempotencyKey`, con formato `<tag>.<id>` y **sin `:`** (BullMQ 6 rechaza un `jobId` con `:`), p. ej. `identity.verification.<id del token>` |

Mecanismo del evento: el de ADR-0019 (`Aceptado`); el plan no repite su contenido. En resumen: se emite en
proceso tras el commit desde `EventEmitterAccountEventsPublisher`, que envuelve `emit` en `try/catch` para que un
oyente que falle no convierta en `500` una verificación ya confirmada (§6.4). La pérdida del evento la cubre la
conciliación idempotente de 006a (PD-40, §6.12).

### Tiempo real

Ninguno.

## 6. Diseño de componentes

### 6.1 Estructura de `identity`

```
apps/api/src/modules/identity/
├─ domain/
│  ├─ user.entity.ts                      # User (abstracta): id, fullName, email, passwordHash, role, status, emailVerified
│  ├─ client-user.entity.ts               # ClientUser: register(), replacePendingRegistration(), verifyEmail()
│  ├─ internal-user.entity.ts             # InternalUser (solo lectura en 001; 011 las crea)
│  ├─ verification-token.entity.ts        # VerificationToken: issue(), stateAt(now), isValid(now), consume(now), invalidate(now)
│  ├─ email-address.vo.ts                 # EmailAddress.of(raw): recorta y pasa a minúsculas (D-16); localPart()
│  ├─ opaque-token.vo.ts                  # OpaqueToken.generate(), hashOf(value), isWellFormed(value) (node:crypto)
│  ├─ password-hash.vo.ts                 # PasswordHash: PHC opaco; toJSON() → '[REDACTED]'
│  ├─ legal-acceptance.vo.ts              # termsVersion, privacyVersion, acceptedAt
│  ├─ account-status.enum.ts              # ACTIVE ('activa') | SUSPENDED ('suspendida')
│  ├─ client-account-verified.event.ts    # CLIENT_ACCOUNT_VERIFIED = 'identity.client-account-verified'; type ClientAccountVerifiedEvent = { readonly userId: string }
│  └─ errors/                             # IdentityInvalidInputError, IdentityWeakPasswordError, IdentityTooManyRequestsError,
│                                         # VerificationLinkExpiredError, VerificationLinkInvalidError
├─ application/
│  ├─ ports/
│  │  ├─ i-user-repository.port.ts
│  │  ├─ i-verification-token-repository.port.ts
│  │  ├─ i-password-hasher.port.ts
│  │  └─ i-account-events-publisher.port.ts
│  ├─ registration.service.ts             # register(), resendVerification(), verifyEmail()
│  ├─ verification-link-issuer.ts         # invalida vigentes → emite token → arma enlace → devuelve el correo a enviar
│  ├─ registration-attempt-notifier.ts    # D-17 con IRateLimiter (1 aviso cada 24 h por cuenta)
│  ├─ identity-config.ts                  # IDENTITY_CONFIG { webPublicUrl } (desde el entorno validado)
│  └─ mail/
│     ├─ verification-mail.template.ts    # asunto, texto y HTML (spec §11, RN-9)
│     └─ registration-attempt-mail.template.ts
├─ infrastructure/
│  ├─ persistence/
│  │  ├─ usuario.orm-entity.ts            # @Entity('usuario')
│  │  ├─ token-cuenta.orm-entity.ts       # @Entity('token_cuenta')
│  │  ├─ user.mapper.ts  verification-token.mapper.ts
│  │  ├─ typeorm-user.repository.ts
│  │  └─ typeorm-verification-token.repository.ts
│  ├─ argon2id.hasher.ts                  # Argon2idHasher implements IPasswordHasher
│  └─ event-emitter-account-events.publisher.ts
├─ presentation/
│  ├─ auth.controller.ts                  # AuthController: register, resendVerification, verifyEmail
│  ├─ identity-ip-throttler.guard.ts      # ThrottlerGuard + tabla throttler → ámbito → IdentityTooManyRequestsError (D-15)
│  └─ identity-validation.ts              # fábrica de errores para ZodValidationPipe (elige INVALID_INPUT o WEAK_PASSWORD)
├─ identity.module.ts
└─ index.ts                               # IdentityModule; contratos de eventos: CLIENT_ACCOUNT_VERIFIED y ClientAccountVerifiedEvent (y en 002: el verificador token→Actor)
```

Pruebas unitarias junto al código (`*.spec.ts`).

### 6.2 Dominio y reglas

- **`ClientUser`** es inmutable: cada método devuelve una instancia nueva (Art. VII.7).
  - `ClientUser.register({ id, fullName, email, passwordHash, acceptance })` nace con `emailVerified = false`,
    `status = ACTIVE` y `role = CLIENT` fijo (RN-1, CA-7).
  - `replacePendingRegistration({ fullName, passwordHash, acceptance })` solo si no está verificada (D-10); si lo
    está, lanza un error interno que la aplicación nunca deja llegar al cliente.
  - `verifyEmail()` devuelve la cuenta con `emailVerified = true`.
- **`VerificationToken.stateAt(now)`** devuelve `invalidated` si `invalidatedAt` existe; `used` si `usedAt` existe;
  `expired` si `now >= expiresAt`; `valid` en otro caso. `isValid(now)` y `consume(now)` son los del diagrama.
  `issue({ id, userId, type, tokenHash, createdAt, expiresAt })` recibe el vencimiento **ya calculado**: la aplicación
  (`VerificationLinkIssuer`) hace `expiresAt = now + VERIFICATION_LINK_TTL_HOURS` (D-7). El dominio solo exige
  `expiresAt > createdAt`.
- **El dominio no importa `@nimbo/contracts`** (ADR-0008, regla 3): ningún valor de `parameters.ts` ni de
  `LEGAL_DOCUMENTS` entra al dominio directamente. La aplicación los lee y los pasa como argumentos: el vencimiento
  del token, y la `LegalAcceptance` ya armada (versiones vigentes + `now`) que recibe `ClientUser.register` y
  `replacePendingRegistration`. La longitud del nombre la validan el esquema y el `CHECK` de la BD.
- **`OpaqueToken`**: 32 bytes de `crypto.randomBytes` (256 bits ≥ 128 de RN-4) en base64url sin relleno (43
  caracteres). Se guarda `sha256(valor)` en hex. Después de buscar por hash se compara con `timingSafeEqual` (D-19).
  Un hash simple basta porque el token no es adivinable. Un HMAC con pimienta no protegería más y agregaría un
  secreto que administrar.
- **`EmailAddress`**: `trim().toLowerCase()`, sin reglas por proveedor (D-16). El formato completo lo valida el
  esquema de `contracts`, antes.
- **Política de contraseña (D-6)**: `evaluatePassword` en `contracts`, porque la usan el formulario y el `api`, y el
  dominio no puede importar `contracts` (ADR-0008). Cuenta **puntos de código**, no unidades UTF-16 (`[...s].length`).
  - Mayúscula: `\p{Lu}`, así que `Á` y `Ñ` cuentan.
  - Número: `\p{Nd}`.
  - Símbolo: un carácter que no es `\p{L}`, `\p{N}` ni espacio en blanco (`\s`).
  - Común: la contraseña en minúsculas está en la lista.
  - Igual al correo: la contraseña en minúsculas coincide con el correo normalizado o con su parte local.
- **Lista de contraseñas comunes**: se genera con un script (`packages/contracts/scripts/build-common-passwords.mjs`)
  desde el top 100 000 de SecLists (licencia MIT, atribución en el encabezado). Se guardan **solo** las entradas que
  pasarían las demás reglas sin la de mayúscula: 12 a 128 caracteres, con número y con símbolo. La comparación es
  insensible a mayúsculas, así que «password123!» también bloquea «Password123!». Con ese filtro la lista queda chica
  y se puede enviar al navegador, que aplica **las mismas reglas** que el `api` (CA-22). Meta: menos de 50 KB, que la
  tarea mide.

### 6.3 Aplicación

Puertos de `identity` (Art. V):

| Puerto | Firma | Regla que cumple |
|---|---|---|
| `IUserRepository` (diagrama) | `findByEmail(email)`, `findByEmailForUpdate(email)`, `findByIdForUpdate(id)`, `insertIfAbsent(user): Promise<boolean>`, `update(user)` | (b) repositorio |
| `IVerificationTokenRepository` (nuevo) | `findByHash(hash, type)`, `invalidateActive(userId, type, now)`, `insert(token)`, `consume(id, now): Promise<boolean>` | (b) repositorio; 002 lo reutiliza con `tipo = recuperacion` |
| `IPasswordHasher` (diagrama) | `hash(plain): Promise<PasswordHash>`, `verify(hash, plain): Promise<boolean>` | (a) Argon2 |
| `IAccountEventsPublisher` (nuevo) | `clientAccountVerified(event): void` | (a) aísla el mecanismo de eventos de ADR-0019 |

Puertos que consume: `IMailer` (`notifications`), `IRateLimiter`, `ITransactionRunner`, `IClock` (`shared`).

**`RegistrationService.register(command)`**. Llega ya validado por el pipe, y el guard ya aplicó el límite por IP:

1. `email = EmailAddress.of(command.email)`.
2. `IRateLimiter.consume('identity:email-request:' + sha256(email), [{ limit: 1, windowSeconds: 60 }, { limit: 5, windowSeconds: 3600 }])`.
   Si no se permite, lanza `IdentityTooManyRequestsError(retryAfterSeconds)` y registra `identity.rate_limited`
   (D-8, CA-15). Va antes de cualquier consulta, así la secuencia 202/429 es la misma exista o no la cuenta.
3. `passwordHash = await hasher.hash(command.password)`, **siempre**, también cuando el correo ya existe, para que el
   tiempo de respuesta no delate la cuenta (spec §10). Los hilos de libuv acotan la memoria (§9).
4. En `ITransactionRunner.run`, `findByEmailForUpdate(email)`:
   - **no existe**: `ClientUser.register(...)` con la `LegalAcceptance` que arma la aplicación con la versión
     vigente de `LEGAL_DOCUMENTS` y `now` (CA-1, CA-7) → `insertIfAbsent(user)` → `VerificationLinkIssuer.issue(user)`.
     `insertIfAbsent` ejecuta `INSERT … ON CONFLICT (correo) DO NOTHING RETURNING id`, así que dos altas simultáneas
     que pasaron el límite **no** abortan la transacción con un `23505`. Si devuelve `false`, otra transacción ya
     confirmó la fila: se llama a `findByEmailForUpdate(email)` en **la misma** transacción (en READ COMMITTED esa
     lectura ya la ve) y se sigue por la rama que corresponda (CA-3). Si aun así no aparece, se reintenta la
     transacción completa una vez.
   - **cliente no verificado**: `replacePendingRegistration` → `update` → `VerificationLinkIssuer.issue(user)`,
     que invalida los enlaces anteriores (D-10, CA-4).
   - **cliente verificado o cuenta interna**: no cambia nada; `RegistrationAttemptNotifier.maybeNotify(user)` (D-17).
5. **Después del commit**: `IMailer.send(mensaje)` si la transacción produjo un correo. Encolar fuera de la
   transacción evita mandar un enlace de una transacción revertida.
6. Devuelve `void`; el controlador responde `202`.

**`RegistrationService.resendVerification(command)`**: pasos 1 y 2 iguales, con **la misma clave**, porque D-8 cuenta
juntos el registro y el reenvío. Después, en transacción, solo si la cuenta es de un cliente no verificado:
`VerificationLinkIssuer.issue(user)`. En los demás casos no hace nada (CA-14). Después del commit envía el correo.

**`RegistrationService.verifyEmail(token)`** devuelve `VerifyEmailResult`, que puede ser
`{ outcome: 'VERIFIED', userId }` o `{ outcome: 'ALREADY_VERIFIED' }`:

1. Si `!OpaqueToken.isWellFormed(token)`, lanza `VerificationLinkInvalidError` (CA-11 b).
2. `row = findByHash(OpaqueToken.hashOf(token), 'verificacion')` (un token de otro tipo no se encuentra, CA-12). Si
   no hay fila o falla la comparación en tiempo constante, lanza `VerificationLinkInvalidError`.
3. En transacción, `findByIdForUpdate(row.userId)`. La fila bloqueada serializa las aperturas simultáneas (CA-29 d):
   - cuenta ya verificada → `ALREADY_VERIFIED` (CA-10, incluido un enlace anterior de una cuenta verificada con otro);
   - `stateAt(now) = invalidated` o `used` → `VerificationLinkInvalidError` (CA-11 a);
   - `expired` → `VerificationLinkExpiredError` (CA-9);
   - `valid` → `consume(id, now)` (`UPDATE … SET usado_en = $now WHERE id = $id AND usado_en IS NULL AND invalidado_en IS NULL AND expira_en > $now`);
     si afecta 0 filas → `ALREADY_VERIFIED`; si no, `user.verifyEmail()` → `update` → `invalidateActive` de los
     demás → `VERIFIED`.
4. **Después del commit**, y solo con `VERIFIED`: `IAccountEventsPublisher.clientAccountVerified({ userId })`. Se
   publica exactamente una vez por cuenta porque solo una apertura llega a `VERIFIED` (CA-8).

**`VerificationLinkIssuer.issue(user)`**: `invalidateActive(user.id, 'verificacion', now)` → `OpaqueToken.generate()`
→ `VerificationToken.issue({ …, createdAt: now, expiresAt: now + VERIFICATION_LINK_TTL_HOURS })` (el vencimiento lo
calcula aquí, con el parámetro de `contracts`) → `insert` → arma `{WEB_PUBLIC_URL}/verificar-correo#token=<valor>` → devuelve el
`MailMessage` de verificación con `idempotencyKey = 'identity.verification.' + token.id` (sin `:`, §6.6). El valor en claro solo existe
en memoria y en el correo (R-2, CA-17). Lo reutilizan el registro, el reenvío y la recuperación de una cuenta no
verificada en 002 (002 D-15).

**`RegistrationAttemptNotifier.maybeNotify(user)`**: `IRateLimiter.consume('identity:attempt-notice:' + user.id,
[{ limit: MAX_AVISOS_INTENTO_24H, windowSeconds: 86400 }])`. Si se permite, arma el aviso (fecha del intento en hora de
Guatemala, sin datos de quien lo intentó, con enlaces a iniciar sesión y a recuperar la contraseña) con
`idempotencyKey = 'identity.attempt-notice.' + uuid`. Si no, registra `identity.registration.attempt_notice_suppressed`.
La respuesta al solicitante no cambia en ningún caso (RN-10).

Métodos de ≤ 30 líneas (Art. VII.2): cada rama del paso 4 es un método privado.

### 6.4 Infraestructura de `identity`

- **Repositorios TypeORM**: una entidad ORM por tabla con mapper a `ClientUser` o `InternalUser` según `rol`
  (herencia de tabla única, `design-model.md` M1). Obtienen el `EntityManager` de `TransactionContext` (§6.7), o el
  del `DataSource` fuera de una transacción. El alta usa `INSERT … ON CONFLICT (correo) DO NOTHING RETURNING id`
  (`insertIfAbsent`), porque tras un `23505` Postgres aborta la transacción y ya no se puede releer dentro de ella. No
  existe `EmailAlreadyTakenError`: un `23505` que llegara por otra vía (no debería) sube como error no controlado
  (500). `findByEmailForUpdate` usa `SELECT … FOR UPDATE`.
- **`Argon2idHasher`** con la librería `argon2` (§10.1, ADR-0017). Parámetros: `type: argon2id`, `memoryCost: 19456`
  (19 MiB), `timeCost: 2`, `parallelism: 1`, el mínimo de OWASP que fija RN-3. Son constantes con nombre en el
  adaptador, no variables de entorno (YAGNI). RN-3 pide medirlos en staging, que llega en Fase 2: la tarea de montar
  staging mide la latencia p95 del registro con 25 peticiones concurrentes (RNF-02) y, si el margen de memoria lo
  permite, se suben (§9). Un cambio de parámetros no rompe los hashes existentes, porque cada PHC lleva los suyos.
- **`EventEmitterAccountEventsPublisher`** (ADR-0019): `eventEmitter.emit(CLIENT_ACCOUNT_VERIFIED, { userId })`
  envuelto en `try/catch`. Si tiene éxito registra `identity.account_verified.published`; si un oyente lanza de forma
  síncrona, registra `identity.account_verified.publish_failed` (`warn`, solo `userId`) y **no** relanza, así una
  verificación ya confirmada no se convierte en `500`. Con prueba unitaria
  (`event-emitter-account-events.publisher.spec.ts`: oyente que lanza → sin excepción y con la bitácora).
- **Plantillas de correo** (`application/mail/`): funciones puras que devuelven `{ subject, text, html }`. El HTML es
  mínimo, con estilos en línea: los clientes de correo no cargan hojas de estilo, así que es la excepción a los tokens
  de `ui-guidelines.md`, y el `ui-designer` lo valida contra `mockups/identity/correos/`. Textos de §11 de la spec:
  vigencia de 24 h, un solo uso, «No reenvíes este correo: quien abra el enlace entrará a tu cuenta», qué hacer si no
  pediste el registro, sin contraseña (CA-1, RN-9). Asuntos propuestos: «Verifica tu correo para entrar a Nimbo» y
  «Alguien intentó crear una cuenta con tu correo».

### 6.5 Presentación de `identity`

- **`AuthController`** (`@Controller('auth')`): `@Post('register') @HttpCode(202)`, `@Post('resend-verification')
  @HttpCode(202)`, `@Post('verify-email') @HttpCode(200)`. Valida con `new ZodValidationPipe(schema,
  identityValidationError)`, llama al servicio y mapea el resultado al contrato. No tiene reglas de negocio.
- **Límite por IP (D-15, R-10)**: `ThrottlerModule.forRoot({ throttlers: [{ name: 'register-ip', ttl: 3_600_000,
  limit: REGISTRATIONS_PER_IP_PER_HOUR }] })` en `AppModule`, con almacenamiento **en memoria**: una sola réplica de
  `api` (ADR-0001), y un reinicio que vacía los contadores es aceptable. La ruta `register` lleva
  `@UseGuards(IdentityIpThrottlerGuard)` (`presentation/identity-ip-throttler.guard.ts`), una subclase de
  `ThrottlerGuard` que:
  - tiene una **tabla *throttler* → ámbito** (`{ 'register-ip': 'ip' }` en 001) con la que traduce el *throttler* que
    disparó al `scope` de `IdentityTooManyRequestsError` y de `identity.rate_limited`;
  - sobrescribe `throwThrottlingException` para lanzar `IdentityTooManyRequestsError` con ese `scope` y el
    `Retry-After` que da el detalle del throttler (así la respuesta es la de CA-15 y no la de Nest);
  - no agrega cabeceras `X-RateLimit-*` (`setHeaders: false`, o sobrescribiendo `handleRequest` si la versión fijada
    no lo admite). Esas cabeceras romperían «mismas cabeceras».

  El guard no se registra global y nace con el nombre de `identity` (DT-8 del plan 002): **002-PR-2** agrega `login-ip`
  a la tabla y los `@SkipThrottle` cruzados (`register` omite `login-ip` y `login` omite `register-ip`), sin
  renombrar nada (002 D-5).
- **IP real**: `configureHttpApp` fija `trust proxy = 1`. En staging todo pasa por Traefik, que agrega
  `X-Forwarded-For`, y el puerto de `api` no se publica. En local, a través de Traefik, es lo mismo; si alguien llama
  a `:3000` directo puede falsear la IP, algo irrelevante en local.

### 6.6 `notifications` (T4)

```
apps/api/src/modules/notifications/
├─ application/ports/i-mailer.port.ts     # IMailer, MailMessage, I_MAILER
├─ infrastructure/
│  ├─ smtp-mailer.ts                      # SmtpMailer implements IMailer: encola en `mail` (jobId = idempotencyKey)
│  ├─ mail.processor.ts                   # MailProcessor («processor», worker): idempotencia + SmtpTransport
│  ├─ smtp-transport.ts                   # nodemailer.createTransport desde SMTP_*; sendMail con Message-ID determinista
│  └─ mail-queue.ts                       # MAIL_QUEUE = 'mail', MAIL_JOB_OPTIONS
├─ notifications.module.ts                # api: BullModule.registerQueue('mail') + { provide: I_MAILER, useClass: SmtpMailer }
├─ notifications-worker.module.ts         # worker: MailProcessor + SmtpTransport (lee SMTP_* del entorno del worker)
└─ index.ts                               # IMailer, MailMessage, I_MAILER, NotificationsModule, NotificationsWorkerModule
```

- **`MailMessage`**: `{ to, subject, text, html, idempotencyKey, tag, recipientId? }`. `tag` (p. ej.
  `identity.verification`) y `recipientId` (id de la cuenta) sirven solo para las bitácoras.
  `idempotencyKey` se documenta en el puerto con el formato `<tag>.<id>` (p. ej. `identity.verification.<uuid>`,
  `identity.attempt-notice.<uuid>`): solo letras, dígitos, `.`, `-` y `_`, **nunca `:`**, porque se usa como `jobId`
  y BullMQ 6.3.8 lanza `Custom Id cannot contain :`. `SmtpMailer` lo valida y lanza si no cumple. `notifications` no conoce
  las reglas de `identity`: recibe qué enviar y a quién (`design-model.md` T4).
- **Nombre `SmtpMailer`**: es el del diagrama. La clase encola y la entrega por SMTP ocurre en el `worker`
  (`MailProcessor` + `SmtpTransport`). Se separa así para que `api` no necesite las credenciales SMTP.
- **Reintentos (R-9)**: `attempts: 6` (el envío y 5 reintentos), `backoff: { type: 'exponential', delay: 5000 }`
  (5, 10, 20, 40 y 80 s, unos 2,5 min en total). Las pruebas inyectan un `delay` corto con `MAIL_JOB_OPTIONS`.
  `removeOnComplete: true`; `removeOnFail: { age: 86400 }` (24 h, lo mismo que dura el enlace).
- **Idempotencia (R-9, CA-21)**, en tres capas:
  - `jobId = idempotencyKey`: BullMQ no duplica un trabajo con el mismo id;
  - el procesador revisa `mail:sent:<jobId>` en Redis antes de enviar y la escribe con `SET NX EX 604800` después de
    un envío aceptado, así que un reintento tras un éxito no reenvía;
  - `Message-ID: <jobId@nimbo.me>`, para que los servidores que deduplican por Message-ID lo hagan.
- **Bitácoras del procesador**: corre dentro de `CorrelationContext.run({ correlationId: job.data.correlationId, jobId
  })`, como `PingProcessor` (CA-18: el mismo `correlationId` que la petición). Registra `mail.sent`,
  `mail.retry_scheduled` y, al agotar los intentos, `mail.failed` en nivel `error` con `tag`, `recipientId`,
  `attemptsMade` y `errorCode`/`responseCode` de nodemailer. **Nunca** registra `err.message`, porque nodemailer
  incluye ahí la dirección del destinatario (D-18), ni `job.data` ni el `MailMessage` completo (llevan correo y
  enlace; §6.7). El `failed` final se captura con `@OnWorkerEvent('failed')` y
  también se envuelve en `CorrelationContext`.
- **Destino**: Mailpit en local (`SMTP_HOST=localhost`, `1025`, sin TLS; en el perfil `apps` de compose,
  `SMTP_HOST=mailpit`). En staging, SMTP de Resend (`smtp.resend.com`, `465` con TLS implícito, usuario `resend`,
  contraseña = clave de API; se verifica al configurar, D-12). La configuración de Resend se hace al montar staging.
- **Prueba de contrato** de `IMailer` contra Mailpit (Liskov).

### 6.7 Cambios en `shared`

| Pieza | Ubicación | Detalle |
|---|---|---|
| `IRateLimiter`, `RateLimitRule`, `RateLimitDecision`, `I_RATE_LIMITER` | `application/rate-limit/i-rate-limiter.port.ts` | `consume(key, rules): Promise<{ allowed: true } \| { allowed: false; retryAfterSeconds }>` |
| `RedisRateLimiter` | `infrastructure/rate-limit/redis-rate-limiter.ts` | Ventana deslizante con un *sorted set* por regla (`<key>:<windowSeconds>`). Un único script Lua atómico limpia las entradas viejas, cuenta, decide para **todas** las reglas y solo si todas permiten agrega la solicitud. Las rechazadas no cuentan. `now` llega de `IClock`, así las pruebas controlan el tiempo con `FixedClock`. `PEXPIRE` = ventana. `retryAfterSeconds` = máximo de (entrada más vieja + ventana − ahora) entre las reglas violadas, redondeado hacia arriba. Si Redis falla, lanza (500 genérico): falla cerrado, igual para cualquier correo |
| `REDIS_CLIENT` | `infrastructure/redis/redis-client.provider.ts` | ioredis con oyente de `error` (el mismo cuidado que `RedisHealthIndicator`: nunca `console.error` con la URL); se cierra en `onApplicationShutdown` |
| `TooManyRequestsError` | `domain/errors/too-many-requests.error.ts` | `status = 429`, `retryAfterSeconds`. La usarán `identity` (001, 002), `sharing` (013) y otros límites: cumple la regla de ≥ 3 módulos de su README |
| `FieldIssue`, `DomainError.fields` | `domain/errors/field-issue.ts`, `domain/errors/domain-error.ts` | `FieldIssue { field; reason; message }` se declara en `shared/domain/errors` (el dominio no importa `@nimbo/contracts`); es estructuralmente igual al elemento de `ErrorResponse.fields`. `DomainError` gana la propiedad opcional `readonly fields?: readonly FieldIssue[]` |
| `DomainExceptionFilter` | `presentation/` | agrega `fields` al cuerpo si existen y `Retry-After` si el error es `TooManyRequestsError`. Sigue siendo el único traductor |
| `ZodValidationPipe` | `presentation/zod-validation.pipe.ts` | `new ZodValidationPipe(schema, (issues: FieldIssue[]) => DomainError)` (ADR-0020): valida el cuerpo, convierte los *issues* con la `toFieldIssues` genérica de la raíz de `contracts` y llama a la fábrica de error **de cada módulo** (así el `code` lleva el prefijo del módulo). `shared` no importa nada de `contracts/identity`; la fábrica de `identity` vive en `identity/presentation/identity-validation.ts` |
| `ITransactionRunner`, `TransactionContext` | `application/persistence/`, `infrastructure/persistence/` | `run(work)` abre `DataSource.transaction` y publica el `EntityManager` en `AsyncLocalStorage`. `withActor` de 003 se construye encima (misma ALS más `set_config`), sin duplicar |
| `configureHttpApp(app, env)` | `presentation/configure-http-app.ts` | Lo usan `main.ts` y el arnés de pruebas: middlewares de correlación y versión, prefijo, filtro, `trust proxy = 1`, **solo** analizador JSON con límite de 16 KB (`bodyParser: false` + `useBodyParser('json', …)`; un cuerpo `text/plain` o de formulario queda vacío y responde `IDENTITY_INVALID_INPUT`), y CORS con `origin: CORS_ORIGIN`, métodos `GET`/`POST`, cabeceras `content-type` y `x-correlation-id`, y `exposedHeaders: ['x-correlation-id', 'retry-after']`. `credentials` lo activa 002 cuando existan cookies |
| `I_CLOCK` → `SystemClock` | `shared.module.ts` | Hoy nadie lo provee. `SharedModule` pasa a `@Global()` y exporta `I_CLOCK`, `REDIS_CLIENT`, `I_RATE_LIMITER` e `I_TRANSACTION_RUNNER`. Las pruebas lo sustituyen con `overrideProvider(I_CLOCK).useValue(new FixedClock(...))` |
| `REDACTED_FIELDS` | `infrastructure/logging/redacted-fields.ts` | + `email`, `correo` (D-18), `fullName`, y `to`, `html` y `text` (defensa en profundidad: `to` lleva el correo; `html` y `text`, el enlace). `nombre` ya está. `SMTP_PASSWORD` entra por `SECRET_KEYS` (§6.10: el secreto se declara solo en el `worker`). Regla que acompaña: **nunca** se registra `job.data` ni un `MailMessage` completo; las bitácoras de correo solo llevan `tag`, `recipientId`, `jobId`, `attemptsMade` y códigos de error. `redacted-fields.spec.ts` cubre los campos nuevos |
| `enqueueWithCorrelation(queue, name, data, opts?)` | `infrastructure/queue/` | acepta `JobsOptions` (para `jobId`) sin cambiar a quien ya lo llama |

`shared/index.ts` exporta lo nuevo. `index.spec.ts` (000 CA-17) se actualiza.

### 6.8 Composición

- `AppModule.forRoot(env)`: + `EventEmitterModule.forRoot()`, `ThrottlerModule.forRoot(...)`,
  `NotificationsModule`, `IdentityModule.forRoot(env)` (publica `IDENTITY_CONFIG` con `WEB_PUBLIC_URL`).
- `WorkerModule.forRoot(env)`: + `NotificationsWorkerModule`; `WORKER_QUEUES = [PING_QUEUE, MAIL_QUEUE]`.
- `main.ts`: `NestFactory.create(..., { bodyParser: false })` y `configureHttpApp(app, env)`.
- Arnés `apps/api/test/int/setup/test-app.ts`: usa `configureHttpApp` y admite módulos de `worker` en la misma app,
  para que CA-17, CA-18 y CA-21 capturen las bitácoras de `api` y `worker` en un solo `LogSink`. `containers.ts`
  agrega Mailpit (`axllent/mailpit` con versión fijada) y su API (`/api/v1/messages`).

### 6.9 Frontend (`apps/web`)

Rutas (App Router, grupo `(public)`, sin sesión; todas con `PublicHeader`, D-9):

| Ruta | Tipo | Estados de §11 | CA |
|---|---|---|---|
| `app/(public)/registro/page.tsx` | Server Component: lee el catálogo con `API_INTERNAL_URL` (`revalidate: 60`); pasa los planes o `unavailable` y `API_PUBLIC_URL` al formulario | default, enviando, error-campos, error-servidor, catalogo-no-disponible, exito («Revisa tu correo»), limite-reenvio | CA-22, CA-27 |
| `app/(public)/registro/pedir-enlace/page.tsx` | formulario de correo | pedir-enlace (+ limite-reenvio, exito) | CA-13, CA-14 |
| `app/(public)/verificar-correo/page.tsx` | Client Component: lee `#token` | verificando, exito, plan-de-pago-elegido, ya-verificado, enlace-expirado, enlace-invalido | CA-8 a CA-11, CA-23, CA-28 |
| `app/(public)/terminos/page.tsx`, `app/(public)/privacidad/page.tsx` | estáticas (SSG), versión y fecha desde `LEGAL_DOCUMENTS` | default | CA-23 |
| `app/(public)/iniciar-sesion/page.tsx` | marcador hasta 002 («Inicio de sesión disponible pronto»), destino de «Iniciar sesión» (§11 de la spec) | — | CA-8, CA-10 |

`features/identity/`:

- `components/`: `RegisterForm`, `PlanPicker`, `PasswordRequirements`, `CheckEmailPanel`, `ResendLinkButton`,
  `RequestLinkForm`, `VerifyEmailView`, `LegalDocument`, más `terms-v1.tsx` y `privacy-v1.tsx` (contenido de §6.13).
- `hooks/`: `use-countdown.ts` (60 s; si llega un 429, la cuenta usa `Retry-After`), `use-verify-email.ts`.
- `api.ts`: `register`, `resendVerification`, `verifyEmail` sobre `lib/api-client.ts`.
- `chosen-plan-storage.ts`: D-24.

Piezas comunes: `lib/api-client.ts` (fetch con `x-correlation-id`, interpreta `ErrorResponse` y `Retry-After`),
`lib/error-catalog.ts` (mensajes por `code` y por `reason`, reexporta `IDENTITY_FIELD_MESSAGES`; Art. VI),
`components/nimbo/public-header.tsx` (logo e «Iniciar sesión»; lo reutiliza 002).

Reglas de la interfaz:

- **Formulario**: `react-hook-form` con `zodResolver(registerRequestSchema)` y el mismo esquema que el `api` (CA-22).
  El plan elegido es estado del formulario, pero **no** se envía (D-24, CA-7). `PasswordRequirements` usa
  `evaluatePassword` y muestra cada regla con ícono **y** texto («Cumple»/«Falta»), con `aria-live="polite"`
  (Art. XIII.4). Los errores de la API se ponen en su campo según `fields[].field`; los generales, en un resumen con
  foco. El botón queda deshabilitado y con indicador mientras envía, y no admite doble envío.
- **Planes**: `PlanPicker` muestra nombre y precio **del catálogo**, sin valores en el código (R-11). Preselecciona el
  plan que el catálogo marque como gratuito, no el nombre «Personal» escrito en el código. Con `unavailable` muestra
  «No pudimos cargar los planes; tu cuenta empezará en Personal.» y el registro sigue (CA-22).
- **Elección de plan (D-24, CA-28)**: al enviar con éxito un plan de pago, `chosen-plan-storage` guarda en
  `localStorage` (`nimbo.registro.plan`) `{ planId, planName, savedAt }`. Se usa `localStorage` porque el enlace suele
  abrirse en **otra pestaña** del mismo navegador, y `sessionStorage` no la vería. No guarda correo ni nombre. En la
  pantalla final se lee si `savedAt` tiene menos de 24 h, se muestra el mensaje de CA-28 y se borra. En otro
  dispositivo no existe y no se muestra nada.
- **«Cambiar correo» (CA-27)**: vuelve al formulario con nombre y plan conservados en el estado del componente, la
  contraseña vacía y la casilla desmarcada.
- **Página de verificación**: lee `window.location.hash`, lo borra de inmediato con `history.replaceState` (no queda
  en el historial) y hace **un solo** `POST`, protegido con una referencia contra el doble efecto de React
  `StrictMode`, que en desarrollo mostraría «ya verificado» en lugar de «exito». Sin fragmento, o al recargar, muestra
  **enlace-invalido** con la acción «Pedir un enlace nuevo». La página no carga recursos externos: Inter la sirve
  `next/font` desde el propio origen (RN-8).
- **Cliente HTTP**: el navegador llama a `API_PUBLIC_URL`, que el Server Component pasa como *prop*, sin
  `NEXT_PUBLIC_*` (000 CA-29). En local, `http://localhost/api/v1` a través de Traefik; en staging,
  `https://api.staging.nimbo.me/api/v1`, con CORS.
- **Correo en `pedir-enlace`**: 002 lo prellena (CA-16) desde `sessionStorage`, **no** desde la URL, para que el
  correo no quede en bitácoras de Next.js ni de Traefik.
- **Componentes**: se reutilizan `Button`, `Input`, `Card`, `Badge` y `StateView`. Se agregan `components/ui/label.tsx`,
  `checkbox.tsx`, `radio-group.tsx` y `alert.tsx` al estilo shadcn, pero sobre **controles nativos**
  (`<input type="checkbox|radio">`), sin Radix: son accesibles por defecto y no suman dependencias de tiempo de
  ejecución (§10.2 DT-8). Tokens nuevos: ninguno. Objetivos táctiles de 44 px (ADR-0014).
- **Accesibilidad**: `label` asociado a cada campo, `aria-describedby` a sus requisitos y errores, `aria-invalid`, foco
  al primer error, anuncios con `aria-live`, contraste AA con los tokens existentes.

### 6.10 Variables de entorno

| Variable | Proceso | Esquema | `.env.example` (local) | Staging (al montarlo) | Secreto |
|---|---|---|---|---|---|
| `WEB_PUBLIC_URL` | api | URL; `https` obligatorio si `APP_ENV` ∈ {staging, production} (CA-20) | `http://localhost` | `https://staging.nimbo.me` | no |
| `CORS_ORIGIN` | api | lista de URL separadas por comas | `http://localhost,http://localhost:3002` | `https://staging.nimbo.me` | no |
| `SMTP_HOST` | worker | texto no vacío | `localhost` | `smtp.resend.com` | no |
| `SMTP_PORT` | worker | puerto | `1025` | `465` | no |
| `SMTP_TLS` | worker | `none` \| `starttls` \| `implicit`; `none` prohibido en staging y producción | `none` | `implicit` | no |
| `SMTP_USER` | worker | opcional; obligatorio si hay `SMTP_PASSWORD` | (vacía) | `resend` | no |
| `SMTP_PASSWORD` | worker (solo) | opcional; en `SECRET_KEYS`; declarada **solo** en `workerEnvSchema` | (vacía) | clave de API de Resend | **sí** |
| `MAIL_FROM` | worker | texto no vacío | `Nimbo <no-responder@nimbo.me>` | igual | no |
| `API_PUBLIC_URL` | web | URL; `https` en staging y producción | `http://localhost/api/v1` | `https://api.staging.nimbo.me/api/v1` | no |

- `compose.override.yml`: el `worker` del perfil `apps` recibe `SMTP_HOST: mailpit` y `SMTP_PORT: '1025'`, como ya se
  hace con `API_INTERNAL_URL` en `web`.
- **Secretos por proceso**: hoy `apiEnvSchema` se declara con `satisfies Record<SecretKey, …>`, lo que obligaría a
  declarar `SMTP_PASSWORD` en el `api`, que no la necesita (§6.6). Se cambia la comprobación en
  `shared/infrastructure/config/env.schema.ts`: **cada** clave de `SECRET_KEYS` debe estar en `apiEnvSchema` **o** en
  `workerEnvSchema` (una comprobación de tipos sobre la unión de sus claves, más una prueba unitaria en
  `env.schema.spec.ts` que falla si un secreto no está en ninguno). `REDACTED_FIELDS` y `env-report` siguen leyendo
  `SECRET_KEYS`, sin cambios; `SMTP_PASSWORD` queda redactada en ambos procesos aunque solo el `worker` la declare.
- El arnés de pruebas valida `apiEnvSchema.merge(workerEnvSchema)` cuando compone los dos procesos.
- `pnpm env:check` cubre las variables nuevas sin cambiar el script, porque las lee de los esquemas. Su prueba
  unitaria agrega el caso `NEXT_PUBLIC_SMTP_PASSWORD`.
- Los secretos de Resend viven solo en GitHub Environments y en el `.env` del Droplet (spec §10). Se documenta en
  `docs/operations/ambientes.md` al montar staging.

### 6.11 Qué deja preparado para 002 (D-9, D-20, CA-12, CA-16, CA-26, CA-29)

- `RegistrationService.verifyEmail` devuelve `{ outcome: 'VERIFIED', userId }` **una sola vez** por cuenta. 002
  agrega en `AuthController.verifyEmail`, solo en ese caso, la apertura de la sesión (`SessionService`), las
  credenciales de 002 D-1 y el dispositivo como conocido (002 D-4), y extiende `VerifyEmailResponse`. Si abrir la
  sesión falla, la cuenta queda verificada y la persona inicia sesión a mano: se degrada, sin inconsistencia.
- El consumo atómico del token (§6.3, paso 3) ya garantiza CA-29 (a) a (d) en la parte del token. 001 lo prueba sin
  sesión (§8) y 002 prueba la sesión (002 CA-15).
- `User.emailVerified` y `User.status` están listos para D-9 y 002 D-10 (`IDENTITY_EMAIL_NOT_VERIFIED`,
  `IDENTITY_ACCOUNT_SUSPENDED`).
- `IVerificationTokenRepository` busca por `(hash, tipo)`: un token de verificación nunca sirve para restablecer
  (CA-12). 002 lo prueba al restablecer.
- Quedan para reutilizar: `IPasswordHasher`, `IUserRepository`, `VerificationLinkIssuer` (002 D-15),
  `IdentityIpThrottlerGuard` (002 le agrega `login-ip` para el límite por IP del inicio de sesión), `IRateLimiter` (002 D-5 y D-6),
  `evaluatePassword` (restablecer y cambiar contraseña), `PublicHeader` y el estado **pedir-enlace**.

### 6.12 Dependencia con 006a y orden de construcción

El backend de `identity` **no espera a 006a**. El alcance supera con mucho la guía de < 400 líneas por PR
(`conventions.md` §Git), así que la implementación se integra en **cuatro PR parciales** (`workflow.md` §4.8), cada
uno con bloques completos de `tasks.md` y con lint, typecheck, unit e int en verde:

| PR | Contenido | Depende de | ADR que debe estar aceptado |
|---|---|---|---|
| **PR-1 «contratos, migraciones y shared»** | `packages/contracts` (raíz: `fields`, `validation.ts`; `identity/*`), las dos migraciones, y en `shared`: `FieldIssue`, `TooManyRequestsError`, filtro, `ZodValidationPipe`, `IRateLimiter` → `RedisRateLimiter`, `ITransactionRunner`, `configureHttpApp`, `I_CLOCK`, `REDIS_CLIENT`, `REDACTED_FIELDS`, comprobación de secretos por proceso y esquemas de entorno | — | ADR-0020 (pipe) |
| **PR-2 «notifications y worker»** | puerto `IMailer`, `SmtpMailer`, `MailProcessor`, `SmtpTransport`, `NotificationsModule`/`NotificationsWorkerModule`, `WorkerModule`, Mailpit en el arnés, `compose.override.yml`, `.env.example` (SMTP) | PR-1 | ADR-0018 |
| **PR-3 «backend de identity»** | dominio, aplicación, infraestructura (repositorios, `Argon2idHasher`, publicador) y presentación (`AuthController`, guard), `AppModule`, pruebas int e iso | PR-1 y PR-2 | ADR-0017, ADR-0019 |
| **PR-4 «web»** | páginas estáticas, verificación, pedir enlace, registro con catálogo, `PublicHeader`, cliente HTTP y catálogo de errores, E2E si P-5 lo aprueba | PR-3 (contratos ya en PR-1) | — |

002 puede partir del PR-3 sin esperar la interfaz. Dentro de cada PR, el orden de `tasks.md` es contratos →
dominio → aplicación/infraestructura → presentación → operación y documentación. `verification.md`, `security.md`,
`ui-review.md` y `review.md` se producen una sola vez, con el PR-4.

Si 006a **no** está integrada:

- **Catálogo**: `registro/page.tsx` recibe `404`, un error o un tiempo de espera agotado (2 s) y muestra
  `catalogo-no-disponible`. CA-22 lo exige, así que la demo del 30/09 funciona igual. El contrato del catálogo es de
  006a. Lo que 001 necesita de él: lectura **pública** (sin sesión) de los planes activos con `id`, nombre, precio en
  centavos y una marca de plan gratuito. Queda como pedido al plan de 006a (spec §13, tercer riesgo).
- **Evento**: se publica sin oyentes y la cuenta queda verificada sin suscripción. **Requisito para 006a**: además
  del oyente idempotente, una conciliación (en su migración de datos o en un trabajo) que dé Personal a toda cuenta
  `CLIENT` verificada que no tenga suscripción. Así las cuentas verificadas antes de 006a no quedan sin plan (CA-8,
  segunda parte, se prueba en 006a).
- **Importación**: 001 no importa nada de `billing`. Solo 006a importa de `identity/index.ts` los contratos de
  eventos (`CLIENT_ACCOUNT_VERIFIED`, `ClientAccountVerifiedEvent`; ADR-0019, PD-38).
- Estos tres pedidos a 006a (oyente idempotente, conciliación y lectura pública del catálogo) están en **PD-40**.

### 6.13 Textos de Términos y Política de privacidad (D-22, PD-29)

Viven en `apps/web/src/features/identity/components/terms-v1.tsx` y `privacy-v1.tsx` como contenido estático. La
versión y la fecha salen de `LEGAL_DOCUMENTS` (`contracts`), la misma fuente que usa el servidor al guardar la
aceptación (CA-1, CA-23). Una versión nueva agrega un archivo `-v2` y cambia `LEGAL_DOCUMENTS`; las cuentas existentes
conservan la versión que aceptaron (RN-12). La base son los borradores de `mockups/identity/terminos/` y
`privacidad/`. **Textos finales aprobados por Adrián el 2026-09-27 (P-2, cierra PD-29)**: vigencia 30/09/2026, edad
mínima de 18 años declarada por el usuario (el registro no la comprueba), contacto amatultab@gmail.com, sin tabla de
retención por plan y con la cookie de dispositivo de 002 y el `localStorage` de D-24.

**Términos de uso** · Versión 1.0 · vigente desde el **30 de septiembre de 2026**

> **Nimbo es un proyecto académico** del curso Ingeniería de Software I de la **Universidad Rafael Landívar**
> (Guatemala, 2026). No es un servicio comercial y estos Términos no son un contrato de servicio.

1. **Qué es Nimbo.** Nimbo es un servicio de almacenamiento en la nube. Te permite guardar y compartir archivos, editar
   documentos `.docx` en el navegador y hacer preguntas sobre tus archivos a un agente. Como es un proyecto académico,
   Nimbo no afirma cumplir ninguna ley ni tener ninguna certificación.
2. **Quién puede usarlo.** Necesitas tener **18 años o más** para crear una cuenta; al aceptar estos Términos declaras que
   los tienes. Cada correo puede
   tener una sola cuenta.
3. **Tu cuenta**. Para activar tu cuenta abres el enlace que te enviamos por correo. Ese
   enlace abre tu sesión y funciona una sola vez durante 24 horas: **no lo reenvíes**. Cuida tu contraseña; nadie de
   Nimbo te la va a pedir.
4. **Tus archivos.** Tus archivos son tuyos. Nimbo los usa solo para prestarte el servicio. El equipo interno
   (Administración, Soporte y Operación) nunca ve su contenido. La Política de privacidad explica qué datos se guardan
   y con quién se comparten.
5. **Uso aceptable.** Te comprometes a no subir contenido ilegal ni contenido que infrinja derechos de otras
   personas, a no intentar entrar a cuentas que no son tuyas y a no intentar saltarte los límites de tu plan o de los
   intentos de acceso.
6. **Planes y pagos simulados.** **Los pagos son simulados: no se cobra dinero real.** Los precios de los planes, en
   quetzales, son parte de la demostración. Toda cuenta nueva empieza en el plan gratuito Personal. No
   escribas los datos de una tarjeta real.
7. **Disponibilidad y copias.** Nimbo se ofrece «tal cual». Puede tener interrupciones y, por ser un proyecto
   académico, puede perder datos. **Guarda siempre una copia de tus archivos importantes** fuera de Nimbo.
8. **Suspensión de cuentas.** Nimbo puede suspender las cuentas que no cumplan estos Términos.
9. **Eliminar tu cuenta y fin del proyecto.** Puedes pedir que se elimine tu cuenta cuando quieras: escribe a
   amatultab@gmail.com desde el correo con el que te registraste. Cuando termine el proyecto, **todos los datos
   (cuentas, archivos y bitácoras) se borrarán a finales de noviembre de 2026**.
10. **Cambios a estos Términos.** Si cambian, se publica una versión nueva con su número y su fecha en esta misma
    página.
11. **Contacto.** El responsable de Nimbo es **Adrián Matul** (amatultab@gmail.com).

**Política de privacidad** · Versión 1.0 · vigente desde el **30 de septiembre de 2026**

> **Nimbo es un proyecto académico** del curso Ingeniería de Software I de la **Universidad Rafael Landívar**
> (Guatemala, 2026). No es un servicio comercial ni un contrato de servicio, y no afirma cumplir ninguna ley ni tener
> ninguna certificación.

- **Lo esencial.** Tus datos no se venden ni se usan para publicidad. Nadie del equipo interno ve el contenido de tus
  archivos. Los pagos son simulados. Todos los datos se borran a finales de noviembre de 2026.

1. **Quién es responsable.** Adrián Matul (amatultab@gmail.com), para dudas, para ejercer tus derechos sobre tus datos
   o para pedir que se borren.
2. **Qué datos se guardan.**
   - *Al registrarte*: tu nombre completo y tu correo; tu contraseña, **solo como hash con Argon2id**; la fecha y la
     versión de los Términos y de esta Política que aceptaste. El plan que eliges al registrarte se guarda **solo en
     tu navegador**, no en Nimbo.
   - *Mientras usas Nimbo*: tus archivos y carpetas y sus metadatos (nombre, tamaño, fechas); las versiones de tus
     archivos y quién participó en cada una; con quién compartes y los enlaces públicos que creas; las preguntas que
     le haces al agente; tus datos de facturación simulada (NIT y nombre).
   - *Para proteger el servicio*: la dirección IP desde la que te conectas, que se usa para limitar abusos y aparece
     en las bitácoras técnicas; bitácoras técnicas y de auditoría,
     que **nunca contienen el contenido de tus archivos, tus contraseñas ni tus tokens**.
3. **Para qué se usan.** Para prestarte el servicio; verificar tu correo; proteger tu cuenta (limitar intentos y
   avisarte si alguien intenta registrarse con tu correo); mostrarte cuánto de tu cuota usas; y operar el sistema y
   corregir errores.
4. **Con quién se comparten.** Con los proveedores que hacen funcionar el servicio: **DigitalOcean** (servidores y
   almacenamiento), **Resend** (envío de correos: recibe tu correo y el mensaje, por ejemplo el enlace de
   verificación) y **Google Gemini** (inteligencia documental: recibe fragmentos del contenido de tus archivos para
   indexarlos y para responder tus preguntas). Tus datos no se venden ni se usan para publicidad.
5. **Qué ve el equipo interno.** Administración, Soporte y Operación **nunca acceden al contenido de tus archivos ni a
   sus vistas previas**. Soporte puede ver metadatos, como el nombre o el tamaño de un archivo, para ayudarte; cada
   consulta de Soporte queda registrada y puedes verla.
6. **Cómo se protegen.** La comunicación va cifrada (TLS); las contraseñas y los enlaces de un solo uso se guardan solo
   como hash; cada cuenta está aislada y nadie ve tus archivos si no los compartes.
7. **Cuánto tiempo se guardan.** Lo que envías a la papelera y las versiones anteriores de tus archivos se guardan el
   tiempo que indica tu plan, visible en la página de planes. Todo lo demás, hasta que elimines tu cuenta o hasta el
   borrado de finales de noviembre de 2026, lo que ocurra primero..
8. **Cookies y almacenamiento del navegador.** Nimbo usa solo lo necesario: una cookie para mantener tu sesión, otra
   para reconocer tu navegador y avisarte si alguien entra desde uno nuevo, y el almacenamiento local del navegador
   para recordar el plan que elegiste al registrarte. No hay cookies de publicidad ni de análisis de terceros..
9. **Eliminar tu cuenta y tus datos.** Escribe a amatultab@gmail.com desde el correo con el que te registraste. Al
   terminar el proyecto se borran todos los datos a finales de noviembre de 2026.
10. **Edad mínima.** Nimbo es solo para personas de **18 años o más**.
11. **Cambios a esta Política.** Si cambia, se publica una versión nueva con su número y su fecha en esta misma página.

## 7. Observabilidad

**Bitácoras (eventos)**. Todas llevan `correlationId`, y las del `worker` también `jobId`. Identifican la cuenta
**solo** por `userId`/`recipientId`, sin correo, nombre, token, hash ni URL (CA-18, D-18):

| Evento | Nivel | Campos | Cuándo |
|---|---|---|---|
| `identity.registration.accepted` | info | `userId`, `kind: 'new' \| 'pending_replaced'` | alta nueva o reemplazo de una pendiente |
| `identity.registration.existing_account` | info | `userId` | intento sobre una cuenta verificada o interna |
| `identity.registration.attempt_notice_sent` / `_suppressed` | info | `userId` | D-17 |
| `identity.verification.resend_requested` | info | `userId` | reenvío a una cuenta no verificada |
| `identity.verification.resend_ignored` | info | — | reenvío sin efecto (sin id: el correo puede no existir) |
| `identity.verification.succeeded` | info | `userId` | CA-8 |
| `identity.verification.rejected` | info | `reason: 'expired' \| 'invalid' \| 'already_verified'`, `userId?` (solo si el token existía) | CA-9 a CA-11 |
| `identity.account_verified.published` | info | `userId` | evento emitido |
| `identity.account_verified.publish_failed` | warn | `userId` | un oyente lanzó al emitir; la verificación sigue confirmada (ADR-0019) |
| `identity.rate_limited` | warn | `scope: 'email' \| 'ip' \| 'attempt_notice'`, `retryAfterSeconds` | CA-15 (sin IP ni correo) |
| `mail.enqueued` | info | `tag`, `recipientId`, `jobId` | `SmtpMailer.send` |
| `mail.sent` | info | `tag`, `recipientId`, `attemptsMade` | `worker` |
| `mail.retry_scheduled` | warn | `tag`, `recipientId`, `attemptsMade`, `errorCode` | fallo con reintentos pendientes |
| `mail.failed` | error | `tag`, `recipientId`, `attemptsMade`, `errorCode` | reintentos agotados (CA-21) |
| `mail.duplicate_skipped` | info | `tag`, `jobId` | idempotencia |

- **Métricas**: ninguna nueva en 001 (RNF-18: los contadores llegan con 022). Candidatas para 022:
  `nimbo_identity_registrations_total{kind}`, `nimbo_identity_verifications_total{result}` y
  `nimbo_notifications_mail_failed_total`.
- **Alertas nuevas**: ninguna. Candidata para 022: `mail.failed` sostenido.
- **Salud**: `worker` sigue con Redis; no se agrega un indicador SMTP, porque un SMTP caído no debe sacar al `worker`
  de servicio (se degrada, Art. XII).

## 7b. Seguridad y privacidad (Art. IX)

- **Anti-enumeración (RN-5)**:
  - se valida antes de consultar;
  - el límite por correo cuenta solicitudes, antes de consultar, y los rechazos no cuentan;
  - el hash de Argon2id se calcula siempre;
  - la respuesta es la misma y sin cabeceras variables;
  - el aviso de intento tiene un tope silencioso;
  - un token inexistente responde como uno alterado.

  Quedan diferencias de tiempo de milisegundos (escrituras y encolado). Las revisa a mano el `security-auditor`
  (spec §10).
- **Secretos en reposo**: la contraseña se guarda como PHC Argon2id y el token como SHA-256. El token en claro existe
  solo en memoria del `api`, en el correo y **en el trabajo de BullMQ en Redis** mientras se entrega (hasta 24 h si
  falla). Redis no se publica fuera de la red de compose. Es un riesgo aceptado y documentado; CA-17 cubre BD y
  bitácoras.
- **El enlace como credencial (D-20)**: un solo uso con consumo atómico, invalidación al reemplazarse y fragmento `#`
  (no llega a servidores ni a `Referer`); la página lo borra del historial.
- **Asignación masiva (CA-7)**: esquemas estrictos; el rol, el estado, la verificación y la versión de Términos los
  fija el servidor.
- **Límites de tasa (RNF-07)**: por correo (Redis) y por IP (throttler, `trust proxy = 1`). La verificación no se
  limita: con 256 bits de entropía la fuerza bruta es inviable (spec §10).
- **Transporte**: `https` obligatorio en `WEB_PUBLIC_URL` y `API_PUBLIC_URL` en staging; `SMTP_TLS=none` prohibido
  fuera de local. El resto lo cubre 000 CA-32.
- **CORS**: orígenes explícitos, sin comodín ni credenciales en 001.
- **Bitácoras**: `REDACTED_FIELDS` + `email`, `correo`, `fullName`, `to`, `html` y `text`; **nunca** se registra
  `job.data` ni un `MailMessage` completo (solo `tag`, `recipientId`, `jobId`, `attemptsMade`); los errores de
  nodemailer se registran por código, nunca por mensaje.
- **Roles internos**: 001 no les da ninguna ruta; los tokens y contraseñas no existen en claro. Sin `RolesGuard`
  todavía (003).
- **Dependencias con código nativo**: `argon2` trae binarios precompilados (§10.1); pnpm 10 no ejecuta scripts de
  instalación salvo en `onlyBuiltDependencies`, y la tarea lo verifica en `node:22-alpine`.

## 8. Estrategia de pruebas

Unitarias junto al código; integración en `apps/api/test/int/<modulo>/` con Testcontainers (Postgres, Redis y
Mailpit), `FixedClock` sustituyendo `I_CLOCK` y el procesador de `mail` en la misma app para capturar las bitácoras
de `api` y `worker`. Nombres `'CA-n: …'` (Art. II).

| Criterio | Nivel | Archivo propuesto |
|---|---|---|
| CA-1 | int + unit | `apps/api/test/int/identity/register.int-spec.ts` (fila de `usuario` y `token_cuenta`, vencimiento a 24 h con `FixedClock`, correo en Mailpit); `modules/identity/application/registration.service.spec.ts`; `application/mail/verification-mail.template.spec.ts` (24 h, advertencia, sin contraseña, enlace `http://localhost/verificar-correo#token=`) |
| CA-2 | int + unit | `register.int-spec.ts` (cuenta verificada y cuenta interna insertada a mano: sin cambios, un aviso y ninguno más en 24 h); `registration-attempt-notifier.spec.ts` |
| CA-3 | unit + int | `domain/email-address.vo.spec.ts`; `apps/api/test/int/identity/user-repository.int-spec.ts` (dos `insertIfAbsent` concurrentes en transacciones distintas → una fila, uno devuelve `false` y su `findByEmailForUpdate` en la misma transacción encuentra la fila; ninguna transacción abortada); `register.int-spec.ts` (variantes con punto y `+etiqueta` son cuentas distintas) |
| CA-4 | int | `register.int-spec.ts` (nombre y hash reemplazados; X ya no verifica; el enlace anterior da `LINK_INVALID`; enlace nuevo en Mailpit; antes de 60 s → 429 sin cambios) |
| CA-5 | unit + int | `packages/contracts/src/identity/password-policy.spec.ts` (una prueba por regla, `Nimbo-Seguro-2026`, `Ñandú-Azul-2026`, espacio como único símbolo); `register-validation.int-spec.ts` (misma respuesta con correo existente y nuevo) |
| CA-6 | unit + int | `packages/contracts/src/identity/schemas.spec.ts`; `apps/api/test/int/identity/register-validation.int-spec.ts` (cada campo, casilla sin marcar, `text/plain`, sin cuenta ni token ni correo) |
| CA-7 | int | `register-validation.int-spec.ts` (campos extra → `UNKNOWN_FIELD`; con `Authorization`; ninguna fila creada con otro rol o plan) |
| CA-8 | int | `apps/api/test/int/identity/verify-email.int-spec.ts` (`correo_verificado`, `usado_en`, otros tokens inválidos, un solo evento con `{ userId }` capturado por un oyente de prueba). La segunda parte (suscripción Personal) se prueba en 006a |
| CA-9 | int | `verify-email.int-spec.ts` (`FixedClock` + 24 h + 1 s) |
| CA-10 | int | `verify-email.int-spec.ts` (repetir N veces; enlace viejo de una cuenta ya verificada) |
| CA-11 | unit + int | `domain/opaque-token.vo.spec.ts`; `verify-email.int-spec.ts` (reemplazado, inexistente, alterado en un carácter, vacío, formato incorrecto; el cuerpo no trae datos de la cuenta) |
| CA-12 | unit + int (parcial) | `typeorm-verification-token.repository` en `user-repository.int-spec.ts` (búsqueda por `tipo`). Se completa en 002 (restablecer) y en 003 (el token como `Bearer` no autentica) |
| CA-13 | int + web | `apps/api/test/int/identity/resend-verification.int-spec.ts`; `features/identity/components/resend-link-button.spec.tsx` (cuenta regresiva) |
| CA-14 | int + iso | `resend-verification.int-spec.ts`; `apps/api/test/isolation/identity-enumeration.iso-spec.ts` |
| CA-15 | int + iso | `apps/api/test/int/shared/redis-rate-limiter.int-spec.ts` (contrato de `IRateLimiter`: ventanas, `retryAfter`, atomicidad concurrente); `apps/api/test/int/identity/rate-limits.int-spec.ts` (60 s, 5/h, 10/h por IP con `X-Forwarded-For`, `Retry-After`, mensaje); `identity-enumeration.iso-spec.ts` (la misma secuencia 202/429 y los mismos cuerpos y cabeceras en los cuatro tipos de cuenta) |
| CA-16 | int (**en 002**) | la escribe 002 (`login.int-spec.ts`); 001 deja `emailVerified` listo |
| CA-17 | int | `apps/api/test/int/identity/token-secrecy.int-spec.ts` (token sacado de Mailpit; búsqueda en todas las columnas de texto de `usuario` y `token_cuenta` y en el `LogSink`; `token_hash ≠ token`; dos registros → tokens distintos) |
| CA-18 | unit + int | `shared/infrastructure/logging/redacted-fields.spec.ts` (`email`, `correo`, `fullName`, `to`, `html`, `text`); `apps/api/test/int/identity/identity-logs.int-spec.ts` (los flujos listados en CA-18; nada sensible; eventos presentes; el `correlationId` del trabajo de correo es el de la petición) |
| CA-19 | unit + int | `infrastructure/argon2id.hasher.spec.ts` (contrato de `IPasswordHasher`); `apps/api/test/int/identity/password-hash.int-spec.ts` (PHC `$argon2id$v=19$m=19456,t=2,p=1$…`, sales distintas, verificación correcta, ninguna respuesta con hash) |
| CA-20 | manual (staging, Fase 2) | `verification.md`: redirección `http→https`, enlace `https://staging.nimbo.me/…`, cabeceras `Authentication-Results` con SPF y DKIM |
| CA-21 | int | `apps/api/test/int/notifications/mail-degradation.int-spec.ts` (SMTP apuntando a un puerto sin servidor; respuesta igual que CA-1; se levanta Mailpit con **puerto fijo** en el host antes de agotar los intentos → un solo correo; con los intentos agotados → `mail.failed` con `correlationId` y `recipientId`); `smtp-mailer.int-spec.ts` (contrato de `IMailer`; encola una clave real `identity.verification.<uuid>` y una con `:`, que se rechaza) |
| CA-22 | web + e2e | `features/identity/components/register-form.spec.tsx`, `plan-picker.spec.tsx`, `password-requirements.spec.tsx`, `check-email-panel.spec.tsx` (Testing Library + jest-axe: estados, teclado, doble envío, errores por campo, `catalogo-no-disponible`); `e2e/registro.e2e.ts` (Playwright + axe a 360 y 1440 px) |
| CA-23 | web + e2e | `features/identity/components/verify-email-view.spec.tsx` (estados; `replaceState`; un solo `POST` con `StrictMode`); `app/(public)/terminos/page.spec.tsx`, `privacidad/page.spec.tsx` (versión igual a `LEGAL_DOCUMENTS`, sin URL externas); `e2e/verificar-correo.e2e.ts` (axe a 360 y 1440 px; sin peticiones a terceros) |
| CA-26 | int (**en 002**) | 002 CA-15 |
| CA-27 | web | `register-form.spec.tsx` («Cambiar correo» conserva nombre y plan, vacía la contraseña y desmarca la casilla) |
| CA-28 | web | `chosen-plan-storage.spec.ts`; `verify-email-view.spec.tsx` (mensaje en el mismo navegador; sin mensaje sin `localStorage`) |
| CA-29 | int (token) + **002** (sesión) | `apps/api/test/int/identity/verify-email-concurrency.int-spec.ts` ((a) a (c) sin efectos repetidos; (d) dos `POST` simultáneos → un `verified`, un `already-verified` y un solo evento); la sesión, en 002 CA-15 |

- **Aislamiento**: `identity-enumeration.iso-spec.ts` corre en `pnpm test:isolation`. Cuando 003 entregue los dos
  roles de BD, corre como `nimbo_app` (ADR-0005).
- **Pruebas de contrato** (Art. VIII, `architecture.md` §5): `IPasswordHasher`, `IRateLimiter` e `IMailer`.
- **E2E**: 001 es el primer flujo completo con interfaz y backend, y el primero que puede cumplir «axe a 360 y 1440 px»
  (Art. XIV). **Pasa a la Fase 2 (P-5, Adrián, 2026-09-27)**: CA-22 y CA-23 se cubren con pruebas de
  componentes con jest-axe y la revisión del `ui-designer` a 360 y 1440 px; Playwright y `@axe-core/playwright`
  llegan en la primera semana de la Fase 2 (PD-41).
- **Cobertura**: `domain/` y `application/` de `identity` y `notifications`, y las piezas nuevas de `shared`, ≥ 60 %
  (RNF-11).

## 9. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| **Plazo del Avance 1 (30/09)**: quedan 3 días y el Avance pide 001–007 `Hecha`; este plan toca `shared`, dos módulos nuevos, el `worker`, contratos y cinco pantallas | Alta | Entrega del 30 % incompleta | Cuatro PR de §6.12: contratos, migraciones y backend primero (el PR-3 desbloquea 002). La interfaz se arma con componentes existentes. E2E con Playwright recortable (P-5). Tareas `[P]` entre `shared`/`notifications` y el dominio de `identity` |
| `argon2` no carga su binario en `node:22-alpine` (musl) o pnpm 10 bloquea su script de instalación | Media | Build roto en CI o en el Droplet | La primera tarea del adaptador verifica en la imagen `runtime` que carga el binario precompilado `linux-x64-musl` sin compilar (y agrega `argon2` a `onlyBuiltDependencies` si hace falta). Alternativa en el ADR: `@node-rs/argon2` (napi-rs, binarios por plataforma) |
| Memoria de Argon2id: 25 registros simultáneos (RNF-02) con `mem_limit` de 768 MB en `api` y 4 GB en staging | Baja | Latencia o falta de memoria | argon2 corre en el *threadpool* de libuv (4 hilos por defecto): como máximo 4 hashes a la vez, unos 76 MiB. El resto espera en cola (unos 100 ms por hash, p95 estimado < 1 s). Se mide al montar staging; no se sube `m` sin medir |
| El evento se pierde (proceso que cae entre el commit y la emisión, o fallo del oyente) | Baja | Cuenta verificada sin suscripción | Conciliación idempotente en 006a (§6.12). ADR-0019 deja el *outbox* como evolución |
| 006a no expone un catálogo público a tiempo | Media | Registro sin planes | Estado `catalogo-no-disponible` (CA-22); pedido explícito al plan de 006a |
| Estado de BullMQ en Redis con el token y el correo en claro | Baja | Exposición si Redis se compromete | Redis sin puertos publicados en staging; `removeOnComplete`; `removeOnFail` a 24 h (el enlace ya venció). Riesgo documentado en §7b |
| Un filtro de correo (Gmail, Outlook) abre el enlace antes que la persona | Media | Quien lo abre gana la sesión (D-20), o la persona ve «ya verificado» | El fragmento `#` no se ejecuta sin JavaScript y la verificación exige un `POST` desde la página. Los escáneres que solo hacen `GET` no consumen el token. Si en pruebas reales se observa consumo, se propone el clic de confirmación (spec §13) |
| Cabeceras `X-RateLimit-*` o `Set-Cookie` distintas según el caso | Media | Rompe la respuesta neutra (enumeración) | Throttler sin cabeceras; prueba de aislamiento que compara cabeceras (CA-15) |
| Doble ejecución del efecto en `StrictMode` | Alta en desarrollo | Muestra «ya verificado» tras verificar | Guardia de una sola ejecución con prueba (CA-23) |
| Entregabilidad con Resend y cuota del plan gratuito (D-12) | Media | El docente no recibe el enlace | Configurar SPF y DKIM al montar staging; revisar la cuota vigente; cuenta de demo verificada de respaldo |
| `jobId` con `:` rechazado por BullMQ 6 | Segura si no se controla | CA-1 falla en la primera prueba | Formato `<tag>.<id>` documentado en `MailMessage` y validado por `SmtpMailer` (§6.6) |
| Alcance de un solo PR demasiado grande para revisar | Alta | Revisión superficial o PR bloqueado | Cuatro PR parciales (§6.12) |

## 10. Decisiones

### 10.1 ADR de los que depende este plan

Redactados por el `architect` y **aceptados por Adrián el 2026-09-27**. El plan no repite su contenido.

| ADR | Qué decide para 001 | Dónde lo usa el plan |
|---|---|---|
| **ADR-0017** — autenticación (cierra PD-32) | `argon2` para Argon2id y `@nestjs/throttler` para el límite por IP; para el token de acceso de 002, `@nestjs/jwt` **con** Passport (`@nestjs/passport` + `passport-jwt`, P-7), con una sola constante de opciones de verificación que comparte con el puerto token→`Actor`. 001 no instala nada de JWT | §6.4 (`Argon2idHasher`), §6.5 (`IdentityIpThrottlerGuard`), §9 (binario musl) |
| **ADR-0018** — correo transaccional | nodemailer por SMTP con la cola `mail`: Mailpit en local, Resend en staging, reintentos e idempotencia por clave del trabajo | §6.6, §6.10 |
| **ADR-0019** — eventos de dominio | `@nestjs/event-emitter` tras el commit, publicador con `try/catch`, conciliación en el consumidor; arista `billing → identity` solo para contratos de eventos (PD-38) | §3b, §5 Eventos, §6.4, §6.12 |
| **ADR-0020** — validación con zod | `ZodValidationPipe` en `shared` con esquemas de `contracts` en lugar de `class-validator` (enmienda ADR-0015) | §5, §6.5, §6.7 |

Dependencias menores sin ADR propio, porque ya las decidieron `conventions.md`, ADR-0014 o el stack de `CLAUDE.md`:

- en `web`: `react-hook-form` y `@hookform/resolvers`;
- en `web` (desarrollo): `@testing-library/react` y `@testing-library/user-event`, para probar teclado, doble envío y
  cuenta regresiva, que `renderToStaticMarkup` no permite.

### 10.2 Decisiones técnicas del plan (no las tomó la spec)

- **DT-1 `RegistrationService`** separado de `AuthService`. `conventions.md` pide dividir un servicio que supere ~7
  métodos: 002 agregará a `AuthService` login, refresh, logout, forgot, reset y change password, y con registro,
  verificación y reenvío serían 9. `AuthController` conserva el nombre del diagrama. Requiere actualizar el diagrama M1.
- **DT-2 Token en el fragmento `#token=` y verificación por `POST`**: cumple RN-8 sin configurar bitácoras de Traefik
  ni de Next.js.
- **DT-3 Campos extra rechazados**, no ignorados (CA-7 dejaba elegir): el error es visible y se puede probar, y un
  cliente con errores no pierde datos en silencio.
- **DT-4 `token_cuenta.invalidado_en` y `creado_en`**: distinguen «reemplazado» (CA-11 a) de «vencido» (CA-9) y de
  «usado» (CA-10) sin inferirlo del orden de creación. Con el índice parcial garantizan un solo enlace vigente.
  Registrado como DF-53 (`Aceptado`).
- **DT-5 Tres columnas de aceptación** (`version_terminos`, `version_privacidad`, `terminos_aceptados_en`): cada
  página muestra su propia versión (CA-23), así que se guardan las dos. Una sola fecha, porque la casilla es una.
- **DT-6 Límites por correo en Redis con ventana deslizante** (no ventana fija): una ventana fija permitiría 10
  solicitudes en pocos segundos alrededor del cambio de hora. Los rechazos no cuentan, para no extender el bloqueo.
- **DT-7 Throttler en memoria**: una réplica de `api`. Si algún día hay dos, se cambia el almacenamiento (con ADR).
- **DT-8 Controles nativos** en `checkbox` y `radio-group` en lugar de Radix: menos dependencias y accesibilidad nativa.
- **DT-9 `attempts: 6`**: «reintenta 5 veces» (R-9) se lee como el envío más 5 reintentos.
- **DT-10 Errores del enlace con `422`**, sin agregar `410 Gone` a `shared`.
- **DT-11 `SharedModule` global** y proveedor de `I_CLOCK`, `REDIS_CLIENT`, `I_RATE_LIMITER` e `I_TRANSACTION_RUNNER`.
- **DT-12 Solo JSON** en el `api`: se desactiva el analizador `urlencoded` y se limita el cuerpo a 16 KB.

### 10.3 Preguntas

Ninguna bloquea el `architect` ni las tareas de backend. Las de textos y E2E hay que responderlas antes de cerrar la
interfaz.

- **P-1 (resuelta, Adrián 2026-09-27: se acepta la lectura y se precisa CA-6)** — CA-6 dice «un cuerpo que no es JSON». El plan responde `IDENTITY_INVALID_INPUT`
  cuando el `Content-Type` no es JSON (el cuerpo llega vacío). Con `application/json` **mal formado**, el analizador
  falla antes de la ruta y responde `400 VALIDATION_FAILED`, el genérico de 000. ¿Se acepta esa lectura (con una
  precisión en la spec) o se exige `IDENTITY_INVALID_INPUT` también ahí? Lo segundo obliga a un filtro por ruta sobre
  errores del analizador, que primero hay que verificar que Nest entrega.
- **P-2 (resuelta, Adrián 2026-09-27: textos finales en §6.13, cierra PD-29)** — Textos de §6.13:
  - fecha de vigencia (propuesta: 30/09/2026);
  - edad mínima de 18 años (el registro no la comprueba);
  - correo de contacto;
  - quitar la tabla de retención por plan;
  - mencionar la cookie de dispositivo de 002 y el `localStorage` de D-24.
- **P-3 (resuelta por el `architect`)** — Mecanismo de eventos y arista `billing → identity`: ADR-0019 (`Aceptado`),
  arista aceptada solo para contratos de eventos (PD-38).
- **P-4 (resuelta por el `architect`)** — zod en los DTO HTTP: ADR-0020 (`Aceptado`).
- **P-7 (resuelta, Adrián 2026-09-27: se conserva Passport)** — 002 usa `@nestjs/jwt` + `@nestjs/passport` +
  `passport-jwt` con la condición de ADR-0017 c). No afecta a 001.
- **P-5 (resuelta, Adrián 2026-09-27: el E2E pasa a la Fase 2, PD-41)** — ¿001 introduce Playwright y `@axe-core/playwright` (unas 3–4 h, primera
  suite E2E) o, por el plazo del 30/09, CA-22 y CA-23 se cubren con pruebas de componentes con jest-axe más la
  revisión del `ui-designer` a 360 y 1440 px, y el E2E pasa a la primera semana de la Fase 2?
- **P-6 (dueña de 006a, con el `architect`)** — Lectura pública del catálogo (campos de §6.12), oyente idempotente y
  conciliación de cuentas verificadas sin suscripción: registrado como **PD-40**, que resuelve el plan de 006a.

### 10.4 Documentos que se actualizan con este plan (los hace quien corresponde)

- **`architect`** (hecho con la aprobación): `design-model.md` (M1, M4, T1, T4 y §4), `architecture.md` (§3, §5, §8 y
  §10), `design-findings.md` (DF-53, DF-54), ADR-0017 a 0020 y `pendientes.md` (PD-36, PD-38, PD-39, PD-40). PD-32 ya
  quedó cerrado. Queda: PD-37 (`conventions.md`, estado de ADR-0015 y línea del stack en `CLAUDE.md` al aceptar
  ADR-0017 y ADR-0020) y PD-29 cuando Adrián apruebe los textos.
- **`ui-designer`**: `ui-guidelines.md` §7 (pasar los mockups de 001 a `Aprobado` si corresponde) y validar las
  plantillas HTML de correo.
- **developer**:
  - `.env.example` y `compose.override.yml` (§6.10);
  - `docs/operations/ambientes.md` (Mailpit y, al montar staging, Resend);
  - README de `identity`, `notifications` y `shared`;

## 11. Aprobación de arquitectura

> Sección escrita por el subagente `architect`.

- **Veredicto: Aprobado con cambios** (`architect`, 2026-09-27).
  - Condición: ADR-0017 a ADR-0020 (`Aceptado`) se aceptan antes de las tareas que instalan sus dependencias:
    `argon2` y `@nestjs/throttler` (0017), nodemailer (0018), `@nestjs/event-emitter` (0019) y `ZodValidationPipe`
    (0020).
  - Contratos, migraciones y dominio pueden empezar ya.

### Evaluación

| # | Punto | Resultado | Evidencia |
|---|---|---|---|
| 1 | Fronteras | ☑ | Registro y verificación en `identity`; correo en `notifications` (ADR-0010); límite por correo, transacción, reloj y validación en `shared`. Ningún módulo importa internos de otro: `identity` usa `notifications/index.ts` y `shared/index.ts`. El `worker` compone `NotificationsWorkerModule` desde `index.ts` (§6.6, §6.8) |
| 2 | Grafo | ☑ | Aristas nuevas: `identity → shared, notifications`, ya permitidas por `architecture.md` §3. `billing → identity` queda **aceptada** por ADR-0019 (b.1), solo para contratos de eventos. `shared` y `contracts` se descartan por las razones del ADR. No hay ciclo: nada de lo que depende `identity` depende de `billing` (PD-38) |
| 3 | Capas | ☑ con cambio 3 | El dominio usa solo `node:crypto` (ADR-0008 regla 3). El controlador valida con el pipe y delega. Argon2, nodemailer, ioredis, TypeORM y EventEmitter2 quedan en `infrastructure`. Falla: `VerificationToken.issue()` lee un parámetro de `contracts` (cambio 3) |
| 4 | YAGNI | ☑ | Los puertos nuevos cumplen Art. V.2: `IVerificationTokenRepository` (b), `IAccountEventsPublisher` (a), `ITransactionRunner` (a, y 003 lo reutiliza). No se crea la tabla `notificacion` ni puerto de plantillas; `SMTP_*` solo en el `worker`. Se acepta `idx_token_cuenta_usuario_id`, aunque hoy solo sirve a la cascada: es barato y D-21 puede llegar a borrar cuentas |
| 5 | DRY | ☑ con cambio 4 | Un esquema y una política de contraseña en `contracts` para `web` y `api` (CA-22, ADR-0020). `REDACTED_FIELDS` sigue siendo la única lista. `VerificationLinkIssuer` sirve a registro, reenvío y 002 D-15. `LEGAL_DOCUMENTS` es la única fuente de versiones. `configureHttpApp` la comparten `main.ts` y el arnés. `withActor` se construirá sobre `TransactionContext`, sin duplicar |
| 6 | SOLID | ☑ | `RegistrationService` orquesta y separa emisión y aviso (DF-54). `IMailer` solo con `send` e `IRateLimiter` solo con `consume` (ISP). Hay pruebas de contrato de los tres adaptadores (Liskov) |
| 7 | Seguridad estructural | ☑ con cambio 7 | Operaciones anónimas sin `actor` y sin datos de cuentas en la respuesta (spec §10); **no hay filtrado después de consultar**, porque las consultas son por hash o por correo normalizado. Anti-enumeración por construcción: validar → límite por correo → Argon2 siempre → misma respuesta y mismas cabeceras (§7b). Token en `#` y por `POST`. Sin RLS porque no es contenido (ADR-0005), y los permisos de `nimbo_app` quedan en PD-39. Bitácoras solo con `userId` o `recipientId` |
| 8 | Integridad | ☑ con cambios 1 y 2 | Consumo atómico con `UPDATE … WHERE usado_en IS NULL` más la fila de `usuario` bloqueada (CA-29 d). Índice único parcial como segunda barrera. Evento y correo después del commit. Trabajo de correo idempotente (ADR-0018). Las dos migraciones tienen `down` real (`DROP TABLE`) y se revierten en orden LIFO. Fallan el `jobId` con `:` (cambio 1) y la relectura tras un `23505` (cambio 2) |
| 9 | Degradación | ☑ | SMTP caído: el registro responde igual y el `worker` reintenta (CA-21). Catálogo de 006a caído: `catalogo-no-disponible`. Sin oyentes: la verificación funciona. Un SMTP caído no saca de servicio al `worker` porque no hay indicador de salud SMTP |
| 10 | Recursos | ☑ | Argon2id con `m = 19 MiB` en el *threadpool* de libuv (4 hilos) usa ≈ 76 MiB como máximo dentro de los 768 MB del `api`. Cola `mail` con concurrencia 1, el valor por defecto. El throttler en memoria cabe porque hay una sola réplica (ADR-0001) |
| 11 | Datos | ☑ | `uuid`, `timestamptz`, `varchar` + `CHECK` para estados (`design-model.md` §5); no hay bytes ni dinero. `char(64)` con `CHECK` hex para el hash. Hay índice para cada consulta del plan: correo, hash y vigente por `(usuario_id, tipo)`. Sin columnas especulativas: `recuperacion` en el `CHECK` lo usa 002 D-6 |
| 12 | Diagramas y DF | ☑ | DF-13, DF-35 y DF-33 (`usuario`) están `Aceptado`. **DF-53** (`token_cuenta`) y **DF-54** (clases de M1, T1 y T4) quedan registrados y `Aceptado` con esta aprobación. El redibujo está en PD-06 y PD-36. `design-model.md` (M1, M4, T1, T4 y §4) y `architecture.md` (§3, §5, §8 y §10) ya coinciden con el plan |

### Cambios requeridos (el planner los aplica en este plan y en `tasks.md`)

1. **`jobId` sin `:`** (§5 Eventos, §6.3 y §6.6).
   - BullMQ 6.3.8 lanza `Custom Id cannot contain :` cuando el `jobId` tiene `:` y no tiene exactamente tres
     segmentos (`bullmq/dist/cjs/classes/job.js`, validación de opciones). Así, `'identity.verification:' +
     token.id` hace fallar CA-1 en la primera prueba.
   - Usar `identity.verification.<id del token>` e `identity.attempt-notice.<uuid>`, y documentar el formato en
     `MailMessage.idempotencyKey`.
   - La prueba de contrato de `SmtpMailer` encola una clave real.
2. **Alta concurrente (CA-3)** (§6.3, paso 4, y §6.4).
   - Después de un `23505`, Postgres aborta la transacción, así que «se relee la fila y se sigue» dentro de ella
     falla con `current transaction is aborted`.
   - Usar `INSERT … ON CONFLICT (correo) DO NOTHING RETURNING id` y, si no devuelve fila, `findByEmailForUpdate` en
     la misma transacción: en READ COMMITTED esa lectura ya ve la fila confirmada. La alternativa es reintentar la
     transacción completa una vez.
   - Ajustar la firma de `IUserRepository` (p. ej. `insertIfAbsent(user): Promise<boolean>`) y
     `user-repository.int-spec.ts`. `EmailAlreadyTakenError` desaparece o queda solo como defensa.
3. **El dominio no importa `contracts`** (§6.2).
   - `VerificationToken.issue()` no puede leer `VERIFICATION_LINK_TTL_HOURS` de `packages/contracts` (ADR-0008,
     regla 3). La aplicación le pasa `expiresAt` o la duración.
   - Lo mismo vale para cualquier otro valor de `parameters.ts` o `LEGAL_DOCUMENTS` que use el dominio:
     `ClientUser.register` recibe la `LegalAcceptance` ya armada.
4. **La validación no acopla `shared` a `identity`** (§5, tabla de archivos de contrato, y §6.7; ADR-0020).
   - `toFieldIssues` es genérica y vive en la raíz de `contracts` (`validation.ts`), no en `identity/schemas.ts`.
   - En la raíz, `ErrorResponse.fields[].reason` es un código `SCREAMING_SNAKE`. El conjunto cerrado de `reason` y
     `IDENTITY_FIELD_MESSAGES` quedan en `contracts/identity`.
   - El `FieldIssue` de `DomainError.fields` se declara en `shared/domain/errors`, porque el dominio no importa
     `@nimbo/contracts`.
   - Firma: `new ZodValidationPipe(schema, (issues: FieldIssue[]) => DomainError)`.
5. **Secretos por proceso** (§6.10).
   - Hoy `apiEnvSchema` se declara con `satisfies Record<SecretKey, …>` (`shared/infrastructure/config/env.schema.ts`).
     Agregar `SMTP_PASSWORD` a `SECRET_KEYS` obliga a declararlo en el `api`, y eso contradice §6.6 («`api` no
     necesita las credenciales SMTP»).
   - El plan fija la corrección: cada secreto debe estar en `apiEnvSchema` **o** en `workerEnvSchema`.
     `REDACTED_FIELDS` y `env-report` siguen leyendo `SECRET_KEYS`. Con prueba unitaria.
6. **Publicación del evento** (§3b, §5 Eventos y §6.4; ADR-0019).
   - `identity/index.ts` exporta solo `CLIENT_ACCOUNT_VERIFIED` (constante con el nombre) y
     `ClientAccountVerifiedEvent` (tipo de solo lectura `{ userId }`).
   - `EventEmitterAccountEventsPublisher` envuelve `emit` en `try/catch` y registra
     `identity.account_verified.publish_failed` (`warn`, solo `userId`). Así, un oyente que lance una excepción de
     forma síncrona no convierte en `500` una verificación ya confirmada. Con prueba unitaria.
   - §3b cambia la «propuesta» por la decisión: arista aceptada y restringida a contratos de eventos (PD-38).
7. **Redacción de `MailMessage`** (§6.7 y §7b).
   - Agregar `to`, `html` y `text` a `REDACTED_FIELDS` (defensa en profundidad: `html` y `text` llevan el enlace;
     `to`, el correo).
   - Agregar la regla «nunca se registra `job.data` ni un `MailMessage` completo».
   - Cubrirlo en `redacted-fields.spec.ts`.
8. **Referencias ya resueltas**:
   - §3 y §10.2 DT-4: DF-53 y DF-54 están registrados y `Aceptado`;
   - §4 cita PD-39 (permisos de `nimbo_app`);
   - §6.12 y P-6 citan PD-40;
   - §10.1, P-3 y P-4 remiten a ADR-0017 a 0020 (`Propuesto`), sin repetir su contenido;
   - §10.1 refleja que ADR-0017 recomienda `@nestjs/jwt` **sin** Passport, a decisión de Adrián.
9. **Corte en PR** (§6.12 y `tasks.md`).
   - El alcance supera por mucho la guía de menos de 400 líneas por PR (`conventions.md` §Git).
   - Declarar al menos cuatro PR: (1) contratos, migraciones y `shared`; (2) `notifications` y `worker`;
     (3) backend de `identity`; (4) `web`.
   - Así 002 puede partir del PR 3 sin esperar la interfaz.

### Observaciones (no bloquean)

- **Throttler con varios nombres (para 002)**: en `@nestjs/throttler` v6, `ThrottlerGuard` aplica a cada ruta
  **todos** los *throttlers* con nombre del módulo. Cuando 002 agregue `login-ip`, la ruta de registro debe omitirlo
  con `@SkipThrottle`, y viceversa, con una prueba de que el registro solo cuenta en `register-ip` (ADR-0017).
- **Reenvío sin límite por IP**: D-8 solo limita por IP el registro. Una IP puede pedir reenvíos para muchos correos
  distintos, cada uno limitado a 5 por hora. No revela cuentas, pero el `security-auditor` debe revisarlo. Si hay
  que limitarlo, es un cambio de spec.
- **P-1**: la opción más simple es aceptar `400 VALIDATION_FAILED` para JSON mal formado y precisarlo en CA-6. Un
  filtro por ruta sobre errores del analizador es acoplamiento sin beneficio de seguridad, porque la respuesta no
  depende del correo.
- **Diferencias de tiempo** entre ramas (escrituras y encolado): aceptadas por la spec §10; las revisa el
  `security-auditor`.
- **Marca `mail:sent`**: cubre un trabajo estancado tras un envío aceptado, no una caída entre el envío y la marca
  (ADR-0018). Es suficiente para CA-21.
- **Riesgo de integración con `origin/spec/006a-catalogo-y-limites`**: esa rama parte de un `main` anterior a PD-09
  y a ADR-0010. Su `design-findings.md` devuelve a `Abierto` DF-01, 02, 03, 11, 13, 30, 32, 33, 34 y 35, y borra
  DF-50, DF-51 y DF-52. Al integrarla hay que conservar los estados de `main` y las filas DF-53 y DF-54.

### Segunda revisión (`architect`, 2026-09-27)

- **Veredicto final: Aprobado.**
  - Condición, ya recogida en la tabla de PR de §6.12: cada PR se integra cuando su ADR está `Aceptado` (PR-1 con
    ADR-0020, PR-2 con ADR-0018, PR-3 con ADR-0017 y ADR-0019).
  - Decisiones que siguen en manos de Adrián: P-1, P-2, P-5 y P-7.

| Cambio | Estado | Dónde |
|---|---|---|
| 1. `jobId` sin `:` | ☑ | §5 Eventos (`<tag>.<id>`); §6.3 (`identity.verification.<id>` e `identity.attempt-notice.<uuid>`); §6.6 (formato documentado en el puerto) |
| 2. Alta concurrente | ☑ | §6.3, paso 4, y §6.4: `insertIfAbsent` con `ON CONFLICT (correo) DO NOTHING RETURNING id`, después `findByEmailForUpdate` en la misma transacción y, si no aparece, un reintento de la transacción completa. Sin `EmailAlreadyTakenError`. §8 CA-3 prueba las dos transacciones concurrentes |
| 3. Dominio sin `contracts` | ☑ | §6.2: `issue({ …, createdAt, expiresAt })` con el vencimiento que calcula `VerificationLinkIssuer`; `LegalAcceptance` la arma la aplicación (§6.3) |
| 4. Validación desacoplada | ☑ | §5: `toFieldIssues` genérica en `contracts/src/validation.ts` y `reason` genérico en `error.ts`; §6.7: `FieldIssue` en `shared/domain/errors` y `ZodValidationPipe(schema, (issues) => DomainError)` con la fábrica en `identity/presentation/identity-validation.ts` |
| 5. Secretos por proceso | ☑ | §6.10: `SMTP_PASSWORD` solo en `workerEnvSchema`; la comprobación exige que cada secreto esté en uno de los dos esquemas, con su prueba unitaria |
| 6. Evento | ☑ | §3b, §5 y §6.1: `index.ts` exporta solo `CLIENT_ACCOUNT_VERIFIED` y `ClientAccountVerifiedEvent` (tipo de solo lectura). §6.4: `emit` en `try/catch`, con `publish_failed` y su prueba. §7: el evento de bitácora está agregado |
| 7. Redacción | ☑ | §6.7 y §7b: `to`, `html` y `text` en `REDACTED_FIELDS`, y la regla de nunca registrar `job.data` ni un `MailMessage` |
| 8. Referencias | ☑ | DF-53 y DF-54 (§3, DT-4), PD-39 (§4), PD-40 (§6.12, P-6), ADR-0017 a 0020 (§10.1) y P-7 (Passport) |
| 9. Corte en PR | ☑ | §6.12: cuatro PR parciales con sus dependencias y los ADR que cada uno exige |

**Nota editorial (no bloquea).** Dos detalles de §10.4 para corregir cuando se toque el plan:

- dice «cerrar PD-32 al aceptar ADR-0017», pero PD-32 ya está en «Cerrados» de `pendientes.md`, porque el ADR lo
  cubre aunque siga `Propuesto`;
- no menciona **PD-37**: actualizar `conventions.md` y el estado de ADR-0015 al aceptar ADR-0020, y la pila de
  `CLAUDE.md` si P-7 queda sin Passport.
