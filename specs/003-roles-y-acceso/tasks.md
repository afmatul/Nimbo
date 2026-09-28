# Tareas 003 — Roles y acceso

> Spec: `./spec.md` (Aclarada) · Plan: `./plan.md` (Aprobado, §11; cambios aplicados el 2026-09-27; P-1 y P-3 resueltas)
> Leyenda: `[P]` paralelizable con otras `[P]` del mismo bloque (no comparten archivos) · `[P×PR]` puede empezar
> antes de que se integre el PR del que depende su bloque (ver «Paralelismo entre PR») · Cada tarea ≤ 1 h y un commit.
> Dueño: Adrián. Commits con Conventional Commits y sufijo `[003 T-xx]`.
>
> - **Cinco PR parciales** (plan §6.12, `workflow.md` §4.8): PR-A, PR-B, PR-C, PR-D y PR-F. **No hay PR-E**: su
>   contenido (tokens reales en el mundo de aislamiento y la suite de contrato con el verificador y la `JwtStrategy`
>   reales) es de **002-PR-2**. Cada PR cierra con `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:int` y
>   `pnpm test:isolation` en verde en local (el CI llega el 30/09, `workflow.md` §7.2). Ramas:
>   `feat/003-guards` (PR-A, sobre `main`) · `feat/003-roles-bd` (PR-B, **apilada sobre 001 PR-1**) ·
>   `feat/003-access` (PR-C, sobre PR-A + PR-B) · `feat/003-aislamiento` (PR-D) · `feat/003-web` (PR-F).
> - **Forma única del plan**: donde §11.1–§11.6 difieren del cuerpo, manda la línea «Cambios aplicados» (§11): la
>   constante `ACCESS_TOKEN_STRATEGY` vive en `i-access-token-verifier.port.ts`; `JwtStrategy`/`TestJwtStrategy` usan
>   `ignoreExpiration: true` y `validate` devuelve `[false, { reason }]`; `handleRequest` mapea `TokenExpiredError` o
>   `reason: 'expired'` → `expired_token` y **todo lo demás** (incluidos `err` no nulo y estrategia no registrada) →
>   `invalid_token` → **401** (no 500).
> - **Pruebas primero**: toda tarea de código escribe su prueba antes (rojo → verde → refactor) en la misma tarea.
>   Nombres de prueba `'CA-n: …'` (Art. II).
> - **Sin E2E con Playwright** (PD-41, Fase 2): CA-17 se cubre con pruebas de componentes con jest-axe y la revisión
>   del `ui-designer` a 360 y 1440 px.
> - **Dependencias nuevas** (ADR-0017 c.2, `Aceptado`; las instala PR-A, 002 no las reinstala): `@nestjs/passport`,
>   `passport`, `passport-jwt`, `@nestjs/jwt` y `@types/passport-jwt` (dev), con versión exacta.
> - **Diferidos a 005** (D-1, plan §6.11): CA-10, la segunda parte de CA-11 (archivos reales) y CA-14. 003 entrega la
>   forma de `accessibleNodes`, el lector SQL probado y las funciones `nimbo_actor_*`.
> - **No se editan en esta rama**: `design-findings.md` (DF-55), `design-model.md`, `architecture.md`, `pendientes.md`
>   (PD-42/43/44, números provisionales) ni ADR-0017. Los actualiza el `architect` **al integrar** (plan §10.4, §11.4).

## Paralelismo entre PR (objetivo: empezar hoy, 27/09)

```
PR-A  T-01…T-18 (sin dependencias) ─ T-19 cierre ──► merge PR-A ⇒ desbloquea 001 PR-3 (@Public) y 002-PR-2
PR-B  T-20, T-21, T-22 [P×PR] (hoy) · T-23…T-33 (tras 001 PR-1) ─ T-34 cierre ──► merge PR-B
PR-C  T-35 [P×PR] (hoy) · T-36, T-37 (tras T-03) · T-38 (tras T-28, T-29) · T-39 ─ T-40 cierre ──► merge PR-C
PR-D  T-41…T-46 (tras PR-A/B/C; T-45 también tras 001 PR-3) ─ T-47 cierre ──► merge PR-D
PR-F  T-48…T-51 [P×PR] (hoy, sesión falsa) · T-52, T-53 (tras 002-PR-5a) · T-54 (tras 001 PR-4) · T-55 ─ T-56 cierre
```

| Se puede empezar **hoy**, sin esperar ningún merge | Requiere | Por qué |
|---|---|---|
| **PR-A completo** (T-01…T-19) | nada (`main`) | Es lo primero: desbloquea `@Public()` para 001 PR-3 y el puerto, el nombre de la estrategia y los decoradores para 002-PR-2 |
| PR-B: **T-20** (script de rol), **T-21** (compose, `.env.example`, `db:app-role`), **T-22** (lint `rls.js`) | nada | No tocan archivos de 001 (plan §6.12, §11.6). T-22 nombra como permitido `typeorm-transaction-runner.ts`, que llega con 001 T-14; la regla funciona aunque el archivo aún no exista |
| PR-C: **T-35** (`AccessLevel`, `Action`, políticas; CA-8) | nada | El dominio de `access` no importa nada nuevo |
| PR-C: T-36, T-37 | T-03 (PR-A) | Usan `createActor` en las pruebas |
| PR-F: **T-48** (`homePathFor`, `ROLE_LABELS`), **T-49** (`ForbiddenState`), **T-50** (`NotFoundState`, `not-found.tsx`), **T-51** (`InternalAreaPlaceholder`) | T-02 (roles en `contracts`) para T-48 | Componentes puros con props o con una sesión falsa en las pruebas (plan §6.9, §9) |
| PR-B: T-23…T-33 | **001 PR-1** (T-06 migraciones en el arnés, T-14 `TransactionContext`) | Tocan `global-setup.ts`, `migrate.ts`, `TransactionContext` y el runner de 001 |
| PR-D: T-45 | **001 PR-3** (rutas reales de `AuthController`) | CA-3/CA-7 recorren rutas reales |
| PR-F: T-52, T-53 | **002-PR-5a** (grupo `(app)`, `SessionProvider`, «Cerrar sesión») | PD-42 (provisional) |
| PR-F: T-54 | **001 PR-4** (`lib/error-catalog.ts`, `lib/api-client.ts`) | El catálogo es de 001 |

- Con dos personas: una hace PR-A (≈ 1 día); la otra, en paralelo, T-20, T-21, T-22, T-35 y T-48…T-51.
- **Acuerdo con 001 y 002**: desde que PR-A esté en `main`, toda ruta nueva lleva `@Public()` o `@Roles(...)`. Antes
  de eso se escribe sin decorador y T-45 la anota; CA-7 lo detecta.
- **Lo que desbloquea a 002-PR-2** (en orden): T-05 (puerto + `ACCESS_TOKEN_STRATEGY`), T-07 (`@CurrentSessionId`),
  T-11 (`AuthGuardsModule` en `AppModule`), T-13 (`createTestApp` con `accessTokenStrategy`) y T-14 (suite de contrato).

## Bloque 1 — PR-A «autorización en shared» (plan §6.1, §6.2, §6.6; ADR-0017 c.2) — depende de: `main` (000)

- [x] **T-01** Dependencias de Passport con versión exacta — CA: n/a — Depende: — — ~0,5 h
  `pnpm --filter api add -E @nestjs/passport passport passport-jwt @nestjs/jwt` y `-D -E @types/passport-jwt`.
  Comprobar `pnpm typecheck` y `pnpm test` sin cambios. En la descripción del PR (y del de 001 PR-1): posible conflicto
  en `pnpm-lock.yaml`; lo resuelve quien integre segundo, combinando `package.json` y regenerando con `pnpm install`,
  nunca a mano (plan §9).
  Archivos: `apps/api/package.json`, `pnpm-lock.yaml`.

- [x] **T-02** [P] `contracts/shared`: roles y códigos de error — CA: CA-1, CA-5, CA-17 (tipos) — Depende: — — ~0,5 h
  Prueba primero `packages/contracts/src/shared/roles.spec.ts`: `ROLES` es exactamente `CLIENT`, `ADMIN`, `SUPPORT`,
  `OPERATOR`; `roleSchema` acepta los cuatro y rechaza `client`, `''` y `ROOT`; `RoleName` es la unión;
  `SHARED_ERROR_CODES` contiene `SHARED_UNAUTHENTICATED` y `SHARED_FORBIDDEN`. Luego los archivos y la reexportación.
  Archivos: `packages/contracts/src/shared/{roles,error-codes,index}.ts`, `packages/contracts/src/shared/roles.spec.ts`, `packages/contracts/src/index.ts`.

- [x] **T-03** [P] `createActor` y `ALL_ROLES` — CA: CA-4, CA-9 — Depende: — — ~0,5 h
  Prueba primero `apps/api/src/shared/domain/actor.spec.ts`: `canReadContent` es `true` solo para `CLIENT` (tabla con los
  cuatro roles); el objeto está congelado (`Object.isFrozen`); `ALL_ROLES` = `Object.values(Role)` y es de solo
  lectura. Luego `createActor` en `actor.ts` y `ALL_ROLES` en `role.enum.ts`; exportar desde `shared/index.ts`
  (ajustar `index.spec.ts` si enumera exportaciones).
  Archivos: `apps/api/src/shared/domain/{actor,role.enum}.ts`, `apps/api/src/shared/domain/actor.spec.ts`, `apps/api/src/shared/index.ts`.

- [x] **T-04** Errores `UnauthenticatedError` e `InsufficientRoleError` + contrato de roles — CA: CA-1, CA-5, CA-6 — Depende: T-02, T-03 — ~1 h
  Prueba primero: `apps/api/src/shared/domain/errors/auth-errors.spec.ts` (`UnauthenticatedError extends
  UnauthorizedError`, `code = 'SHARED_UNAUTHENTICATED'`, 401; `InsufficientRoleError extends ForbiddenError`,
  `code = 'SHARED_FORBIDDEN'`, 403; mensajes exactos de plan §5) y
  `apps/api/src/shared/presentation/auth/roles-contract.spec.ts` (`Role` de `api` = `ROLES` de `contracts`; los `code`
  de las dos clases = `SHARED_ERROR_CODES`). El dominio **no** importa `contracts` (ADR-0008): el contrato se prueba
  desde `presentation`. Luego las clases y `errors/index.ts`.
  Archivos: `apps/api/src/shared/domain/errors/{unauthenticated,insufficient-role}.error.ts`, `apps/api/src/shared/domain/errors/{index.ts,auth-errors.spec.ts}`, `apps/api/src/shared/presentation/auth/roles-contract.spec.ts`.

- [x] **T-05** Puerto `IAccessTokenVerifier` y `ACCESS_TOKEN_STRATEGY` — CA: CA-2 — Depende: T-03 — ~0,5 h
  Prueba primero en `apps/api/src/shared/index.spec.ts`: `shared` exporta `ACCESS_TOKEN_STRATEGY === 'jwt'` e
  `I_ACCESS_TOKEN_VERIFIER` (símbolo). Luego `i-access-token-verifier.port.ts` con `ACCESS_TOKEN_STRATEGY`,
  `I_ACCESS_TOKEN_VERIFIER`, `AccessTokenClaims`, `AccessTokenVerification` e `IAccessTokenVerifier` tal como plan §5
  (la constante vive **en este archivo**, «Cambios aplicados»). JSDoc: «nunca lanza por un token malo; único que decide
  el vencimiento con `IClock`».
  Archivos: `apps/api/src/shared/application/auth/i-access-token-verifier.port.ts`, `apps/api/src/shared/index.ts`, `apps/api/src/shared/index.spec.ts`.

- [x] **T-06** Suite de contrato (tramo puerto) + `TestAccessTokens` + `TestAccessTokenVerifier` — CA: CA-2 — Depende: T-01, T-05 — ~1 h
  Prueba primero `apps/api/test/support/access-token-verifier.contract.ts`: función
  `describeAccessTokenVerifierContract({ verifier, tokens, clock })` con el **tramo puerto**: válido → `valid: true`
  con `userId`, `role` y `sessionId`; vencido según `FixedClock` → `{ valid: false, reason: 'expired' }`; alterado en
  un carácter, otra clave, `alg: none`, `HS512`, *claims* de más o de menos, `role` fuera de los cuatro → `reason:
  'invalid'`; `verify` nunca lanza. Un `*.spec.ts` la ejecuta con la implementación de prueba. Luego
  `TestAccessTokens` (firma HS256 con clave de prueba; `exp` según `FixedClock`; fábrica de las variantes) y
  `TestAccessTokenVerifier implements IAccessTokenVerifier` (con `JwtService` de `@nestjs/jwt`, `algorithms:
  ['HS256']`, `ignoreExpiration` y vencimiento con el reloj de la prueba).
  Archivos: `apps/api/test/support/{access-token-verifier.contract,test-access-tokens,test-access-token-verifier}.ts`, `apps/api/test/support/test-access-token-verifier.spec.ts`.

- [x] **T-07** [P] `RequestPrincipal` y decoradores — CA: CA-4 — Depende: T-03 — ~1 h
  Prueba primero `apps/api/src/shared/presentation/auth/decorators.spec.ts`: `@Public()` y `@Roles()` escriben sus
  metadatos en clase y método (el método manda al leer con `getAllAndOverride`); `@Roles()` sin argumentos no compila
  (`// @ts-expect-error`); `@CurrentActor()` devuelve lo que guardó `RequestPrincipal.set` y lanza
  `UnauthenticatedError` si no hay nada; con `req.user` escrito y el `WeakMap` vacío, sigue lanzando (nunca lee
  `req.user`); `@CurrentSessionId()` devuelve el `sessionId` guardado. Luego `request-principal.ts` (`WeakMap` privado
  del módulo, `set`/`get`) y los cuatro decoradores con `IS_PUBLIC` y `ROLES_KEY`.
  Archivos: `apps/api/src/shared/presentation/auth/{request-principal,public.decorator,roles.decorator,current-actor.decorator,current-session-id.decorator}.ts`, `apps/api/src/shared/presentation/auth/decorators.spec.ts`.

- [x] **T-08** `JwtAuthGuard.canActivate`: ruta pública y cabecera estricta — CA: CA-1 — Depende: T-01, T-04, T-05, T-07 — ~1 h
  Prueba primero `apps/api/src/shared/presentation/auth/jwt-auth.guard.spec.ts` (primera parte): ruta `@Public()` →
  `true` **sin** llamar a `super.canActivate` ni leer la cabecera (también con un token inválido); sin cabecera →
  `missing_token`; `Basic …`, `Bearer` vacío, dos cabeceras `authorization`, espacios de más → `malformed_authorization`;
  en ambos casos `UnauthenticatedError` sin llamar a Passport. Luego `JwtAuthGuard extends
  AuthGuard(ACCESS_TOKEN_STRATEGY)` con `Reflector`, la expresión `^Bearer ([A-Za-z0-9._~+/-]+=*)$` y el paso a
  `super.canActivate`; si `super` lanza fuera del *callback* (estrategia desconocida), el error va a `handleRequest(err,
  false, undefined, ctx)`.
  Archivos: `apps/api/src/shared/presentation/auth/jwt-auth.guard.ts`, `apps/api/src/shared/presentation/auth/jwt-auth.guard.spec.ts`.

- [x] **T-09** `JwtAuthGuard.handleRequest` y bitácora `auth.unauthenticated` — CA: CA-2, CA-16 — Depende: T-08 — ~1 h
  Prueba primero (segunda parte de `jwt-auth.guard.spec.ts`): `user` con `AccessTokenClaims` → `createActor` +
  `RequestPrincipal.set({ actor, sessionId })` y devuelve `user`; `info.name === 'TokenExpiredError'` o
  `info.reason === 'expired'` → `expired_token`; otro `info`, `user === false`, `err` no nulo o «Unknown authentication
  strategy» → `invalid_token`; todos los rechazos lanzan `UnauthenticatedError` (401, **nunca** 500) y registran
  `auth.unauthenticated` (`info`) con `route` = patrón (`GET /api/v1/__probe/actor/:id`) y `reason`, sin token ni
  cabecera. Luego la implementación.
  Archivos: `apps/api/src/shared/presentation/auth/jwt-auth.guard.ts`, `apps/api/src/shared/presentation/auth/jwt-auth.guard.spec.ts`.

- [ ] **T-10** [P] `RolesGuard` y bitácora `auth.forbidden` — CA: CA-5, CA-6, CA-16, DT-2 — Depende: T-04, T-07 — ~1 h
  Prueba primero `apps/api/src/shared/presentation/auth/roles.guard.spec.ts`: ruta pública → `true`; sin `@Roles` →
  `undeclared_route` → `InsufficientRoleError`; rol no listado → `role_not_allowed`; `@Roles` de método sobrescribe al
  de clase; sin `Actor` → `UnauthenticatedError`; los rechazos registran `auth.forbidden` (`warn`) con `route`,
  `actorId`, `role`, `reason` y `requiredRoles`. Luego la implementación.
  Archivos: `apps/api/src/shared/presentation/auth/roles.guard.ts`, `apps/api/src/shared/presentation/auth/roles.guard.spec.ts`.

- [ ] **T-11** `AuthGuardsModule` estático, `AppModule` y `@Public()` en salud — CA: CA-1, CA-3 — Depende: T-09, T-10 — ~0,5 h
  Prueba primero en `apps/api/src/shared/presentation/health.controller.spec.ts`: `HealthController` tiene `IS_PUBLIC`
  a nivel de clase; y en `apps/api/test/int/shared/health.int-spec.ts`, con los guards activos, `GET /health/live` y
  `/health/ready` responden 200 sin token y también con un `Bearer basura`. Luego `auth-guards.module.ts` (sin
  `forRoot`, sin `imports`: `APP_GUARD` → `JwtAuthGuard` y luego `APP_GUARD` → `RolesGuard`), import en
  `app.module.ts` y `@Public()` en `HealthController`. El `worker` **no** importa `AuthGuardsModule`.
  Archivos: `apps/api/src/shared/presentation/auth/auth-guards.module.ts`, `apps/api/src/app.module.ts`, `apps/api/src/shared/presentation/health.controller.ts`, `apps/api/src/shared/presentation/health.controller.spec.ts`, `apps/api/test/int/shared/health.int-spec.ts`, `apps/api/src/shared/index.ts`.

- [ ] **T-12** `TestJwtStrategy` y controlador sonda — CA: CA-1, CA-2, CA-4, CA-5, CA-6 — Depende: T-06, T-11 — ~1 h
  Prueba primero `apps/api/test/support/test-jwt-strategy.spec.ts`: `validate(req)` con token válido devuelve los
  `claims` del verificador; con vencido devuelve `[false, { reason: 'expired' }]`; con inválido, `[false, { reason:
  'invalid' }]`; nunca lanza. Luego `TestJwtStrategy extends PassportStrategy(Strategy, ACCESS_TOKEN_STRATEGY)`
  (`passport-jwt`, `ExtractJwt.fromAuthHeaderAsBearerToken()`, `algorithms: ['HS256']`, `passReqToCallback: true`,
  `ignoreExpiration: true`; `validate` delega en el puerto), `probe.controller.ts` con las rutas de plan §5 (salvo
  `/__probe/resources/:id`, que llega en T-46) y `probe.module.ts` (controlador + `TestJwtStrategy` +
  `I_ACCESS_TOKEN_VERIFIER` → `TestAccessTokenVerifier`). Nunca en `src/`.
  Archivos: `apps/api/test/support/{test-jwt-strategy,probe.controller,probe.module}.ts`, `apps/api/test/support/test-jwt-strategy.spec.ts`.

- [ ] **T-13** `createTestApp`: guards siempre y registro único de estrategia — CA: CA-1 (arnés) — Depende: T-12 — ~1 h
  Prueba primero `apps/api/test/int/setup/test-app.int-spec.ts`: sin opciones, una ruta sonda protegida responde 401
  sin token (los guards no se pueden apagar; **no** existe `guards: false`, cambio 7); `accessTokenStrategy: 'test'`
  (por defecto) monta `ProbeModule`; pedir `'test'` con un árbol que ya registra otra estrategia
  `ACCESS_TOKEN_STRATEGY` lanza con un mensaje que nombra la regla. Luego `test-app.ts`: importa siempre
  `AuthGuardsModule`, opción `accessTokenStrategy: 'test' | 'identity'` (`'identity'` no monta la de prueba; la usa
  002-PR-2), la comprobación de mezcla tras compilar y el JSDoc con la regla de plan §6.6. Verificar que las suites de
  000 (`health`, `worker-health`, `bootstrap`, `correlation-id`…) siguen en verde con los guards activos.
  Archivos: `apps/api/test/int/setup/test-app.ts`, `apps/api/test/int/setup/test-app.int-spec.ts`.

- [ ] **T-14** Suite de contrato, tramo HTTP — CA: CA-2 — Depende: T-13 — ~1 h
  Prueba primero: agregar a `access-token-verifier.contract.ts` el **tramo HTTP** (los mismos tokens del tramo puerto
  contra `GET /__probe/actor` con los guards globales: válido → 200 con el mismo `Actor`; vencido, alterado, otra clave,
  `alg: none`, `HS512`, *claims* rotos → 401 `SHARED_UNAUTHENTICATED`, y el `reason` de la bitácora coincide con el del
  puerto) y ejecutarla en `apps/api/test/int/shared/access-token-contract.int-spec.ts` con `TestAccessTokenVerifier` +
  `TestJwtStrategy` y `passport-jwt` real. Es la **única** suite de contrato; 002-PR-2 la reutiliza (002 CA-26).
  Archivos: `apps/api/test/support/access-token-verifier.contract.ts`, `apps/api/test/int/shared/access-token-contract.int-spec.ts`.

- [ ] **T-15** CA-1 y CA-4 por HTTP — CA: CA-1, CA-4 — Depende: T-13 — ~1 h
  Prueba primero `apps/api/test/int/shared/auth-guards.int-spec.ts`: `/__probe/undeclared` y `/__probe/client` sin token
  → 401 con cuerpo validado por `errorResponseSchema` y espía del controlador sin llamadas; `/__probe/actor` con un token
  de cada rol devuelve `{ id, role, canReadContent }` (`true` solo para `CLIENT`); un middleware de prueba que escribe
  `req.user` con otro `id`/rol **antes y después** del guard no cambia el `Actor` de `@CurrentActor()` ni el
  `sessionId` de `@CurrentSessionId()` (cambio 5). Sin código de producción nuevo salvo correcciones.
  Archivos: `apps/api/test/int/shared/auth-guards.int-spec.ts`.

- [ ] **T-16** CA-5 y CA-6 por HTTP (sondas) — CA: CA-5, CA-6 — Depende: T-15 — ~0,5 h
  Prueba en `auth-guards.int-spec.ts`: matriz `/__probe/client`, `/__probe/admin`, `/__probe/support`,
  `/__probe/operator`, `/__probe/admin-or-support` × cuatro roles (200 solo los listados; los demás 403
  `SHARED_FORBIDDEN`), y `/__probe/undeclared` con token válido → 403 (DT-2). La matriz de aislamiento con cuentas del
  mundo es T-42.
  Archivos: `apps/api/test/int/shared/auth-guards.int-spec.ts`.

- [ ] **T-17** [P] Sin estrategia registrada → 401 — CA: CA-1, CA-2 — Depende: T-11 — ~0,5 h
  Prueba primero `apps/api/test/int/shared/auth-guards.no-strategy.int-spec.ts` (archivo propio: el registro de
  Passport es por proceso): una app con `AuthGuardsModule` y un controlador de prueba, **sin** estrategia `'jwt'`; ruta
  no pública con cualquier `Bearer` → 401 `SHARED_UNAUTHENTICATED` y bitácora `reason: 'invalid_token'`; ruta pública
  → 200. Monta la app con `Test.createTestingModule` directo (no con `createTestApp`, que siempre registra la de prueba).
  Archivos: `apps/api/test/int/shared/auth-guards.no-strategy.int-spec.ts`.

- [ ] **T-18** [P] Bitácoras de 401 y 403 sin datos sensibles — CA: CA-16 — Depende: T-13 — ~1 h
  Prueba primero `apps/api/test/int/shared/auth-logs.int-spec.ts` (con `LogSink`): 401 (`missing_token`,
  `malformed_authorization`, `invalid_token`, `expired_token`) y 403 (`role_not_allowed`, `undeclared_route`) con
  `correlationId`, `route` como patrón (una petición a `/__probe/actor/<uuid>?x=1` registra `…/:id` sin consulta),
  `actorId` y `role` en 403, y `reason`. Ninguna línea contiene el token enviado, `Bearer`, el correo del *fixture* ni
  el valor de las cabeceras `x-user-id`/`x-actor-role`/`x-forwarded-user`. `http.domain_error` no repite el motivo.
  Archivos: `apps/api/test/int/shared/auth-logs.int-spec.ts`.

- [ ] **T-19** README de `shared` y cierre del PR-A — CA: n/a — Depende: T-01…T-18 — ~1 h
  `apps/api/src/shared/README.md`: guards globales, «toda ruta se declara con `@Public()` o `@Roles(...)`» (con
  `@Roles(...ALL_ROLES)` para la sesión propia), decoradores, `IAccessTokenVerifier` + `ACCESS_TOKEN_STRATEGY` y la
  regla de una sola estrategia por app de prueba. `pnpm lint`, `pnpm typecheck`, `pnpm test` (cobertura ≥ 60 % en las
  piezas nuevas de `shared`, RNF-11), `pnpm test:int`, `pnpm test:isolation`, `pnpm env:check`. Descripción del PR
  («PR parcial»): aviso de `pnpm-lock.yaml` (T-01) y el acuerdo de decoradores con 001 y 002.
  Archivos: `apps/api/src/shared/README.md`, `specs/003-roles-y-acceso/tasks.md` (casillas).

## Bloque 2 — PR-B «roles de BD y withActor» (plan §4, §6.3, §6.4, §6.8, §6.10; ADR-0005) — depende de: **001 PR-1** (T-06, T-14)

- [ ] **T-20** [P] [P×PR] Script de rol `10-nimbo-app.sh` — CA: CA-13 — Depende: — (hoy) — ~1 h
  Prueba primero `apps/api/test/int/shared/app-role-script.int-spec.ts`, con un `PostgreSqlContainer` propio (no el
  compartido): ejecutar el script **dos veces** (idempotente) y comprobar en `pg_roles` que `nimbo_app` tiene `LOGIN` y
  **no** `SUPERUSER`, `BYPASSRLS`, `CREATEDB`, `CREATEROLE` ni `REPLICATION`; puede conectarse con la contraseña dada;
  sin `NIMBO_APP_DB_PASSWORD` el script falla con «falta NIMBO_APP_DB_PASSWORD»; una contraseña con comilla simple
  funciona (la cita `psql`). Luego el script exacto de plan §4 (a), sin `set -e`, con fin de línea LF
  (`.gitattributes` si hace falta).
  Archivos: `infra/postgres/init/10-nimbo-app.sh`, `apps/api/test/int/shared/app-role-script.int-spec.ts`, `.gitattributes` (si aplica).

- [ ] **T-21** [P×PR] Compose, `.env.example` y `pnpm db:app-role` — CA: CA-13 — Depende: T-20 — ~0,5 h
  `compose.yml`: en `postgres`, `NIMBO_APP_DB_PASSWORD: ${NIMBO_APP_DB_PASSWORD}` y el volumen
  `./infra/postgres/init/10-nimbo-app.sh:/docker-entrypoint-initdb.d/10-nimbo-app.sh:ro`. `.env.example`:
  `NIMBO_APP_DB_PASSWORD=nimbo_app` («debe coincidir con `DATABASE_URL`») y el comentario nuevo de `POSTGRES_USER`
  (plan §6.10). `package.json` raíz: `"db:app-role": "docker compose exec -T postgres sh
  /docker-entrypoint-initdb.d/10-nimbo-app.sh"`. Verificación manual (evidencia en «Notas del developer»): volumen
  nuevo → `\du` muestra `nimbo_app`; volumen existente → `pnpm db:app-role` dos veces sin error. `DATABASE_URL` **no**
  cambia aquí (lo hace T-24, con los permisos).
  Archivos: `compose.yml`, `.env.example`, `package.json`.

- [ ] **T-22** [P] [P×PR] Lint `rls.js` (PD-26) — CA: CA-12 — Depende: — (hoy) — ~1 h
  Prueba primero `packages/config/eslint/rls.spec.ts` (con la API `ESLint` y `overrideConfig`): un *fixture* con
  `query('SELECT set_config($1, $2, true)')` y otro con `` `SET LOCAL app.actor_id = …` `` o `SET app.` fuera de
  `**/shared/infrastructure/persistence/typeorm-transaction-runner.ts` fallan con un mensaje que nombra `withActor`; el
  mismo código en ese archivo pasa. Si `packages/config` no tiene configuración de Jest, agregar `jest.config.js`
  mínimo (ts-jest ya es dependencia). Luego `rls.js` (`no-restricted-syntax` sobre literales y plantillas) e
  inclusión desde `nest.js`.
  Archivos: `packages/config/eslint/{rls,nest}.js`, `packages/config/eslint/rls.spec.ts`, `packages/config/jest.config.js` (si falta).

- [ ] **T-23** `migrationEnvSchema` y uso en migraciones — CA: CA-13 — Depende: 001 PR-1 — ~1 h
  Prueba primero en `apps/api/src/shared/infrastructure/config/load-env.spec.ts` (o `env.schema.spec.ts`):
  `migrationEnvSchema` exige `DATABASE_MIGRATION_URL` (URL) y **no** cae a `DATABASE_URL` si falta (`config.invalid`);
  no forma parte de `apiEnvSchema` ni de `workerEnvSchema`. Luego el esquema en `env.schema.ts`, `data-source.cli.ts`
  (`loadEnv(migrationEnvSchema)` + `buildDataSourceOptions({ DATABASE_URL: env.DATABASE_MIGRATION_URL })`) y
  `src/scripts/migrate.ts` con el mismo esquema.
  Archivos: `apps/api/src/shared/infrastructure/config/env.schema.ts`, `apps/api/src/shared/infrastructure/config/load-env.spec.ts`, `apps/api/src/migrations/data-source.cli.ts`, `apps/api/src/scripts/migrate.ts`.

- [ ] **T-24** [P] `env:check`, redacción y `.env.example` de URLs — CA: CA-13, CA-16 — Depende: T-23 — ~0,5 h
  Prueba primero: `scripts/check-env-example.spec.ts` (el grupo `migrations` exige `DATABASE_MIGRATION_URL` en
  `.env.example`) y `apps/api/src/shared/infrastructure/logging/redact-deep.spec.ts` (`DATABASE_MIGRATION_URL` se
  redacta como URL de conexión). Luego `collectSchemaKeys` con `migrations: Object.keys(migrationEnvSchema.shape)`,
  `CONNECTION_URL_FIELDS` y `.env.example`: `DATABASE_URL=postgres://nimbo_app:nimbo_app@localhost:5432/nimbo`,
  `DATABASE_MIGRATION_URL=postgres://nimbo:nimbo@localhost:5432/nimbo`.
  Archivos: `scripts/check-env-example.{ts,spec.ts}`, `apps/api/src/shared/infrastructure/logging/{redacted-fields.ts,redact-deep.spec.ts}`, `.env.example`.

- [ ] **T-25** Arnés con dos roles: aprovisionar y migrar como dueño — CA: CA-13, CA-15 — Depende: T-20, T-23, 001 PR-1 (T-06) — ~1 h
  Prueba primero: primer caso de `apps/api/test/isolation/database-roles.iso-spec.ts` — `env().DATABASE_MIGRATION_URL`
  es el dueño (`getConnectionUri()`) y el rol `nimbo_app` existe en el contenedor compartido. Luego `containers.ts`
  (`withCopyFilesToContainer([10-nimbo-app.sh → /docker-entrypoint-initdb.d/])`, `withEnvironment({
  NIMBO_APP_DB_PASSWORD })`, `env()` con las dos URL) y `global-setup.ts`/`migrate.ts` (de 001 T-06) migrando con
  `DATABASE_MIGRATION_URL`. En esta tarea `DATABASE_URL` sigue siendo el dueño (lo cambia T-26, que da los permisos).
  Archivos: `apps/api/test/int/setup/{containers,global-setup,migrate}.ts`, `apps/api/test/isolation/database-roles.iso-spec.ts`.

- [ ] **T-26** Migración `conceder-permisos-nimbo-app` y la app como `nimbo_app` — CA: CA-13 — Depende: T-25 — ~1 h
  Prueba primero `apps/api/test/int/shared/migrations-nimbo-app.int-spec.ts`: dentro de una transacción del dueño que
  se revierte, `ALTER ROLE nimbo_app RENAME TO …` → el `up` falla con «Falta el rol nimbo_app: ejecuta pnpm
  db:app-role…»; `ALTER ROLE nimbo_app BYPASSRLS` → falla con el mensaje de ADR-0005; `down` y de nuevo `up` sin error.
  Luego `20260928110000-conceder-permisos-nimbo-app.ts` con el SQL de plan §4 (b) y su `down` exacto, y
  `env().DATABASE_URL` de `containers.ts` pasa a `nimbo_app`. Todas las suites `int` de 000 y 001 siguen en verde con
  el rol sin privilegios. `run → revert → run` en local (evidencia en «Notas del developer»).
  Archivos: `apps/api/src/migrations/20260928110000-conceder-permisos-nimbo-app.ts`, `apps/api/test/int/shared/migrations-nimbo-app.int-spec.ts`, `apps/api/test/int/setup/containers.ts`.

- [ ] **T-27** Migración `crear-funciones-de-actor` — CA: CA-12 — Depende: T-26 — ~0,5 h
  Prueba primero en `migrations-nimbo-app.int-spec.ts`: como `nimbo_app`, sin fijar nada, `nimbo_actor_id()` y
  `nimbo_actor_role()` son `NULL`; tras `set_config('app.actor_id', <uuid>, true)` en una transacción devuelven el
  valor y el tipo es `uuid`; con `''` devuelven `NULL`; `down` las elimina. Luego
  `20260928110100-crear-funciones-de-actor.ts` con el SQL de plan §4 (c).
  Archivos: `apps/api/src/migrations/20260928110100-crear-funciones-de-actor.ts`, `apps/api/test/int/shared/migrations-nimbo-app.int-spec.ts`.

- [ ] **T-28** `TransactionContext` con ámbito de actor — CA: CA-12 — Depende: 001 PR-1 (T-14) — ~1 h
  Prueba primero en el `*.spec.ts` de `TransactionContext` (de 001 T-14): el contexto guarda `{ manager, actor? }`;
  `requireActorScope(actor)` sin contexto o con contexto sin actor lanza `ActorScopeMissingError`; con otro `id` u otro
  rol lanza `ActorScopeConflictError`; con el mismo actor devuelve el `EntityManager`. Los dos errores son `Error`
  simples (no `DomainError`: salen como 500). Luego los cambios en `transaction-context.ts` y los errores.
  Archivos: `apps/api/src/shared/infrastructure/persistence/{transaction-context,actor-scope.errors}.ts`, su `*.spec.ts`.

- [ ] **T-29** `ITransactionRunner.withActor` — CA: CA-12 — Depende: T-28 — ~1 h
  Prueba primero en `typeorm-transaction-runner.spec.ts` (de 001 T-14, con `DataSource` falso): `actor.id` que no es
  UUID o `role` fuera de `Role` → error antes de abrir la transacción; sin contexto → una transacción, una sola
  `query('SELECT set_config($1, $2, true), set_config($3, $4, true)', ['app.actor_id', id, 'app.actor_role', role])` y
  `work` corre con `{ manager, actor }`; dentro de `withActor` con el mismo actor → reentrante (sin nueva transacción
  ni nuevo `set_config`); con otro actor o dentro de un `run` sin actor → `ActorScopeConflictError`; `run` dentro de
  `withActor` se une y conserva el actor. Luego el método en el puerto y en `TypeormTransactionRunner` (único archivo
  que el lint de T-22 permite).
  Archivos: `apps/api/src/shared/application/persistence/i-transaction-runner.port.ts`, `apps/api/src/shared/infrastructure/persistence/typeorm-transaction-runner.{ts,spec.ts}`.

- [ ] **T-30** CA-12 contra Postgres real — CA: CA-12 — Depende: T-27, T-29 — ~1 h
  Prueba `apps/api/test/isolation/rls-context.iso-spec.ts` con `DataSource` de `nimbo_app` y `extra.max = 1`: dos
  `withActor` seguidos con actores distintos ven cada uno su `current_setting('app.actor_id')` con el mismo
  `pg_backend_pid()`; después, `current_setting('app.actor_id', true)` vacío o `NULL` y `nimbo_actor_id()` `NULL`; 20
  `withActor` concurrentes con el *pool* normal ven su propio actor; reentrada con el mismo actor sí, con otro lanza
  `ActorScopeConflictError`; `requireActorScope` fuera de `withActor` lanza.
  Archivos: `apps/api/test/isolation/rls-context.iso-spec.ts`.

- [ ] **T-31** `DatabaseRoleCheck` — CA: CA-13, DT-4 — Depende: T-26 — ~1 h
  Prueba primero `apps/api/src/shared/infrastructure/persistence/database-role.check.spec.ts` (con `DataSource` falso):
  cualquiera de `rolsuper`, `rolbypassrls`, `owns_tables` en `true` → registra `db.role_rejected` (`fatal`, solo los
  tres booleanos, sin URL) y lanza con «La API debe conectarse como nimbo_app; revisa DATABASE_URL y ejecuta pnpm
  db:app-role»; los tres en `false` → no hace nada. Luego la clase con la consulta de plan §6.4 (`pg_has_role(r.oid,
  c.relowner, 'USAGE')`, cambio 4) en `onApplicationBootstrap` y su registro en `SharedModule` (lo cargan `api` y
  `worker`).
  Archivos: `apps/api/src/shared/infrastructure/persistence/database-role.check.{ts,spec.ts}`, `apps/api/src/shared/shared.module.ts`.

- [ ] **T-32** CA-13 contra Postgres real — CA: CA-13 — Depende: T-27, T-31 — ~1 h
  Completar `apps/api/test/isolation/database-roles.iso-spec.ts`: la conexión de la app no es superusuario ni
  `BYPASSRLS`, no es dueña de ninguna tabla de `public` y no tiene `CREATE` en `public`; todas las tablas son del rol
  que migra; matriz de permisos (`usuario` y `token_cuenta` sin `DELETE`, `migracion` sin permisos, tablas nuevas con
  `SELECT/INSERT/UPDATE/DELETE` por privilegios por defecto); una app con `DATABASE_URL` del dueño no arranca
  (`db.role_rejected`); un rol de prueba con `GRANT <dueño> TO <rol>` también se rechaza con `ownsTables: true`. Las
  suites `bootstrap` de `api` y `worker` siguen en verde con `nimbo_app`.
  Archivos: `apps/api/test/isolation/database-roles.iso-spec.ts`.

- [ ] **T-33** [P] `ambientes.md` y README de `shared` (persistencia) — CA: n/a — Depende: T-21, T-24, T-29 — ~0,5 h
  `docs/operations/ambientes.md`: filas de `DATABASE_URL` (ahora `nimbo_app`), `DATABASE_MIGRATION_URL` y
  `NIMBO_APP_DB_PASSWORD` (tabla de plan §6.10) y el paso «volumen existente → `pnpm db:app-role`». README de `shared`:
  `withActor`, `requireActorScope`, regla de reentrada, lint `rls.js`, `DatabaseRoleCheck` y la regla de permisos de
  las migraciones siguientes (plan §4 (b)).
  Archivos: `docs/operations/ambientes.md`, `apps/api/src/shared/README.md`.

- [ ] **T-34** Cierre del PR-B y aviso `pnpm db:app-role` — CA: n/a — Depende: T-20…T-33 — ~0,5 h
  `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:int`, `pnpm test:isolation`, `pnpm env:check`;
  `migration:run → revert → revert → run` en el compose local; `\du` y `\dp` guardados para `verification.md`
  (revisión manual de CA-13). **Descripción del PR** (obligatorio, plan §9 y §11.6), en un bloque destacado al inicio:
  «Después de integrar este PR, **cada integrante** debe: (1) agregar `NIMBO_APP_DB_PASSWORD`, `DATABASE_URL` de
  `nimbo_app` y `DATABASE_MIGRATION_URL` a su `.env` (ver `.env.example`); (2) correr `pnpm db:app-role` (su volumen de
  Postgres ya existe y el script de inicio no se vuelve a ejecutar); (3) `pnpm --filter api migration:run`. Sin esto la
  API no arranca (`db.role_rejected`)». Repetir el aviso en el canal del equipo. Resumen («PR parcial»).
  Archivos: `specs/003-roles-y-acceso/tasks.md` (casillas).

## Bloque 3 — PR-C «access» (plan §6.5; ADR-0010) — depende de: PR-A (T-03) y PR-B (T-28, T-29)

- [ ] **T-35** [P] [P×PR] Dominio de `access`: niveles, acciones y políticas — CA: CA-8, DT-10 — Depende: — (hoy) — ~1 h
  Prueba primero `apps/api/src/modules/access/domain/policies/access-policies.spec.ts`: la tabla de plan §6.5 completa
  (tres niveles × once `Action`); un valor de `Action` desconocido (forzado con `as Action`) negado para Editor y
  Viewer y permitido para Owner; `policyFor` es exhaustivo por tipo y el mapa está congelado. Luego
  `access-level.enum.ts`, `action.enum.ts`, `i-access-policy.ts`, las tres políticas (`ReadonlySet` de lo permitido en
  Editor y Viewer) y `access-policies.ts`. Sin Nest ni TypeORM.
  Archivos: `apps/api/src/modules/access/domain/{access-level.enum,action.enum}.ts`, `apps/api/src/modules/access/domain/policies/{i-access-policy,owner.policy,editor.policy,viewer.policy,access-policies}.ts`, `apps/api/src/modules/access/domain/policies/access-policies.spec.ts`.

- [ ] **T-36** `PermissionResolver` e `IAccessLevelReader` — CA: CA-9, CA-8 — Depende: T-03, T-35 — ~1 h
  Prueba primero `apps/api/src/modules/access/application/permission-resolver.spec.ts`: los tres roles internos ×
  `VIEW`, `DOWNLOAD`, `PREVIEW`, `EDIT`, `QUERY_AGENT` → `can` es `false` y `levelFor` es `null`, y el lector falso
  **no** se llama; `nodeId` que no es UUID → `null` sin consultar; `CLIENT` con nivel `EDITOR` → `can(EDIT)` `true`,
  `can(SHARE)` `false`; nivel `null` → `false`. Luego el puerto (`I_ACCESS_LEVEL_READER`, `levelFor(actor, nodeId)`) y
  el servicio (`actor` primer parámetro, DF-01).
  Archivos: `apps/api/src/modules/access/application/{permission-resolver,i-access-level-reader.port}.ts`, `apps/api/src/modules/access/application/permission-resolver.spec.ts`.

- [ ] **T-37** [P] `accessibleNodes` y `AccessibleNodesFragment` — CA: CA-9, CA-10 (forma) — Depende: T-03 — ~0,5 h
  Prueba primero `apps/api/src/modules/access/infrastructure/sql/accessible-nodes.spec.ts`: para los cuatro roles (en
  003 también `CLIENT`) devuelve el conjunto vacío tipado `SELECT NULL::uuid AS nodo_id, NULL::text AS tipo_nodo,
  NULL::text AS nivel WHERE false`; todas las claves de `parameters` empiezan por `access_`; función pura, sin DI.
  Luego la función.
  Archivos: `apps/api/src/modules/access/infrastructure/sql/accessible-nodes.{ts,spec.ts}`.

- [ ] **T-38** `SqlAccessLevelReader` contra Postgres — CA: CA-10 (parcial), CA-9 — Depende: T-29, T-36, T-37 — ~1 h
  Prueba primero `apps/api/test/int/access/sql-access-level-reader.int-spec.ts` (como `nimbo_app`): dentro de
  `withActor` la consulta `SELECT nivel FROM (<fragmento>) accesibles WHERE nodo_id = :access_node_id` con precedencia
  `OWNER > EDITOR > VIEWER` y `LIMIT 1` **se ejecuta** y devuelve `null`; fuera de `withActor` lanza
  `ActorScopeMissingError`. Luego el adaptador (`EntityManager` solo de `TransactionContext.requireActorScope`).
  Archivos: `apps/api/src/modules/access/infrastructure/sql/sql-access-level-reader.ts`, `apps/api/test/int/access/sql-access-level-reader.int-spec.ts`.

- [ ] **T-39** `AccessModule`, `index.ts`, `AppModule` y README — CA: CA-8, CA-9 — Depende: T-38 — ~1 h
  Prueba primero `apps/api/src/modules/access/index.spec.ts`: exporta exactamente `AccessModule`,
  `PermissionResolver`, `accessibleNodes`, `AccessLevel`, `Action` (y el tipo `AccessibleNodesFragment`); y en
  `sql-access-level-reader.int-spec.ts`, `PermissionResolver` se resuelve desde `AccessModule`. Luego
  `access.module.ts` (provee `PermissionResolver` e `I_ACCESS_LEVEL_READER` → `SqlAccessLevelReader`; exporta
  `PermissionResolver`), `index.ts`, import en `app.module.ts` y `README.md` del módulo (qué agregan 005 y 012, plan
  §6.11). `pnpm lint` confirma la frontera `access → shared` (ADR-0008).
  Archivos: `apps/api/src/modules/access/{access.module,index}.ts`, `apps/api/src/modules/access/index.spec.ts`, `apps/api/src/modules/access/README.md`, `apps/api/src/app.module.ts`.

- [ ] **T-40** Cierre del PR-C — CA: n/a — Depende: T-35…T-39 — ~0,5 h
  `pnpm lint`, `pnpm typecheck`, `pnpm test` (cobertura ≥ 60 % en `domain/` y `application/` de `access`, RNF-11),
  `pnpm test:int`, `pnpm test:isolation`. Resumen en el PR («PR parcial»).
  Archivos: `specs/003-roles-y-acceso/tasks.md` (casillas).

## Bloque 4 — PR-D «arnés de aislamiento y rutas» (plan §6.2, §6.7; CA-3, CA-7, CA-11, CA-15) — depende de: PR-A, PR-B, PR-C; T-45 de **001 PR-3**

- [ ] **T-41** Mundo de aislamiento — CA: CA-15, D-3 — Depende: T-13, T-26, T-39 — ~1 h
  Prueba primero `apps/api/test/isolation/isolation-world.iso-spec.ts`: el mundo crea dos clientes casi idénticos
  (mismo nombre visible, correos que difieren en un carácter, mismo estado y fechas) y una cuenta por rol interno,
  insertados con el rol **dueño**; `tokenFor(cuenta)` da un token que `/__probe/actor` acepta con ese `id` y rol;
  `appAs` usa `DATABASE_URL` de `nimbo_app` (con el dueño no arranca). Luego `isolation-world.ts` con *builders*
  (`aClient().named('Ana López').build()`, `anInternal(Role.SUPPORT)`) según `conventions.md`, `tokenFor` con
  `TestAccessTokens` (002-PR-2 lo cambia a tokens reales) y `appAs` con `createTestApp`.
  Archivos: `apps/api/test/isolation/setup/isolation-world.ts`, `apps/api/test/isolation/isolation-world.iso-spec.ts`.

- [ ] **T-42** [P] Matriz de roles y `Actor` en la suite de aislamiento — CA: CA-4, CA-5, CA-6 — Depende: T-41 — ~1 h
  Prueba `apps/api/test/isolation/roles-and-actor.iso-spec.ts` con cuentas del mundo: CA-4, se envían `id`, `userId`,
  `role` y `actor` en la ruta (`/__probe/actor/:id`), el cuerpo (`POST /__probe/actor`), la consulta y las cabeceras
  (`x-user-id`, `x-actor-role`, `x-forwarded-user`), y el `Actor` no cambia; CA-5, `/__probe/client` con los cuatro
  roles; CA-6, las cuatro rutas internas × cuatro roles.
  Archivos: `apps/api/test/isolation/roles-and-actor.iso-spec.ts`.

- [ ] **T-43** [P] Roles internos sin contenido, contra la base — CA: CA-9 — Depende: T-41 — ~0,5 h
  Prueba `apps/api/test/isolation/access-internal-roles.iso-spec.ts`: `PermissionResolver` real, dentro de `withActor`
  como cada rol interno del mundo, da `false` para las acciones de contenido y `null` en `levelFor`; `accessibleNodes`
  ejecutado como subconsulta da 0 filas para cada rol.
  Archivos: `apps/api/test/isolation/access-internal-roles.iso-spec.ts`.

- [ ] **T-44** [P] Recorredor de rutas — CA: CA-7, DT-2 — Depende: T-07 — ~1 h
  Prueba primero `apps/api/test/support/route-declarations.spec.ts`: con un módulo de prueba que tiene una ruta sin
  declarar, otra con `@Public()` y `@Roles()` a la vez y otras bien declaradas, el recorredor devuelve `{ method,
  path, public, roles }` con el prefijo global y lista las dos malas por método y ruta. Luego
  `route-declarations.ts` con `DiscoveryService`, `MetadataScanner` y `Reflector`.
  Archivos: `apps/api/test/support/route-declarations.{ts,spec.ts}`.

- [ ] **T-45** CA-3 y CA-7 sobre la API completa (+ `@Public()` pendientes de 001) — CA: CA-3, CA-7 — Depende: T-44, **001 PR-3** — ~1 h
  Prueba primero `apps/api/test/int/shared/route-declarations.int-spec.ts` con `AppModule` completo: ninguna ruta sin
  declarar ni con las dos; las rutas `@Public()` son **exactamente** la lista explícita (salud `live`/`ready`,
  `auth/register`, `auth/verify-email`, `auth/resend-verification`; las de 002 y 006a se agregan con sus PR); `GET
  /api/v1/health/live` responde 200 sin token. Si 001 PR-3 se integró sin decoradores, agregar `@Public()` en
  `register`, `verify-email` y `resend-verification` de `AuthController` (plan §3b) y comprobar que sus suites de 001
  siguen en verde.
  Archivos: `apps/api/test/int/shared/route-declarations.int-spec.ts`, `apps/api/src/modules/identity/presentation/auth.controller.ts` (solo si falta).

- [ ] **T-46** CA-11: 404 uniforme — CA: CA-11 (parte de 003) — Depende: T-12, T-41 — ~1 h
  Prueba primero `apps/api/test/int/shared/not-found-uniformity.int-spec.ts`: `GET /__probe/resources/:id` como un
  cliente con el `id` de un recurso de **otra** cuenta y con un UUID inexistente → mismo `status` (404), mismo
  `code` (`PROBE_RESOURCE_NOT_FOUND`), mismas cabeceras salvo `x-correlation-id` y mismo cuerpo salvo `correlationId`;
  con su propio recurso → 200. Luego la ruta en `probe.controller.ts`, con un almacén en memoria de recursos por dueño
  que filtra por `actor.id` **en la búsqueda** (no después) y un `NotFoundError` de prueba.
  Archivos: `apps/api/test/support/probe.controller.ts`, `apps/api/test/int/shared/not-found-uniformity.int-spec.ts`.

- [ ] **T-47** CA-15 y cierre del PR-D — CA: CA-15 — Depende: T-41…T-46 — ~1 h
  `pnpm test:isolation` corre como `nimbo_app`: `roles-and-actor`, `access-internal-roles`, `rls-context`,
  `database-roles`, `isolation-world` y la `identity-enumeration.iso-spec.ts` de 001 sin cambios. Se conserva
  `placeholder.iso-spec.ts` (`ISOLATION_FORCE_FAIL=1` hace fallar la suite; evidencia en «Notas del developer»). `pnpm
  lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:int`. Resumen en el PR («PR parcial»).
  Archivos: `specs/003-roles-y-acceso/tasks.md` (casillas).

## Bloque 5 — PR-F «web» (plan §6.9; D-5, D-8; sin E2E, PD-41) — depende de: **001 PR-4** y **002-PR-5a**

- [ ] **T-48** [P×PR] `homePathFor` y `ROLE_LABELS` — CA: CA-17, DT-12 — Depende: T-02 — ~0,5 h
  Prueba primero `apps/web/src/features/access/home-path.spec.ts`: `CLIENT` → `/archivos`; `ADMIN`, `SUPPORT`,
  `OPERATOR` → `/interno`; exhaustivo por tipo (`RoleName` de `contracts`); `ROLE_LABELS` = «Cliente»,
  «Administrador», «Soporte», «Operador». Luego `home-path.ts` y `role-labels.ts`.
  Archivos: `apps/web/src/features/access/{home-path,role-labels}.ts`, `apps/web/src/features/access/home-path.spec.ts`.

- [ ] **T-49** [P] [P×PR] `ForbiddenState` — CA: CA-17 — Depende: T-48 — ~1 h
  Prueba primero `apps/web/src/features/access/components/forbidden-state.spec.tsx` (con jest-axe): `StateView` con
  ícono de candado, título «Sin permiso», texto exacto «No tienes permiso para ver esta página. Si crees que es un
  error, escríbenos a {correo}.» con `SUPPORT_CONTACT_EMAIL`; acción «Ir a mi inicio» a `homePathFor(role)`; el foco
  va al título al montar; objetivo táctil ≥ 44 px; sin violaciones serias de axe. Luego el componente, solo con
  tokens de `ui-guidelines.md`. `SUPPORT_CONTACT_EMAIL` se importa del `legal.ts` de `contracts` (001); si aún no
  existe, se agrega ahí con ese nombre (plan §6.9).
  Archivos: `apps/web/src/features/access/components/forbidden-state.{tsx,spec.tsx}`, `packages/contracts/src/identity/legal.ts` (solo si falta la constante).

- [ ] **T-50** [P] [P×PR] `NotFoundState` y `app/not-found.tsx` — CA: CA-17, CA-11 (web) — Depende: T-48 — ~1 h
  Prueba primero `apps/web/src/features/access/components/not-found-state.spec.tsx` y
  `apps/web/src/app/not-found.spec.tsx` (con jest-axe): texto «No encontramos lo que buscas. Puede que no exista o que
  no tengas acceso.»; con `role` → «Ir a mi inicio» a `homePathFor(role)`; sin sesión → «Ir al inicio»; foco al
  título. Luego el componente y `app/not-found.tsx` (sin sesión en la raíz: «Ir al inicio»; ver Notas).
  Archivos: `apps/web/src/features/access/components/not-found-state.{tsx,spec.tsx}`, `apps/web/src/app/not-found.{tsx,spec.tsx}`.

- [ ] **T-51** [P] [P×PR] `InternalAreaPlaceholder` — CA: CA-17 — Depende: T-48 — ~0,5 h
  Prueba primero `apps/web/src/features/access/components/internal-area-placeholder.spec.tsx` (con jest-axe, props
  falsas `fullName`, `role`, `onLogout`): «Hola, {nombre}. Tu área de {rol} estará disponible pronto.» con `{rol}` en
  minúsculas desde `ROLE_LABELS`; botón «Cerrar sesión» que llama a `onLogout`. Luego el componente (recibe la acción
  de cierre por props; la conecta T-53).
  Archivos: `apps/web/src/features/access/components/internal-area-placeholder.{tsx,spec.tsx}`.

- [ ] **T-52** `RequireRole` — CA: CA-17, CA-5 (experiencia) — Depende: T-48, **002-PR-5a** (contexto de sesión) — ~1 h
  Prueba primero `apps/web/src/features/access/components/require-role.spec.tsx` (sesión falsa con la forma de PD-42
  `{ status, user: { id, fullName, email, role } }` y `next/navigation` simulado): cliente en ruta de cliente → hijos;
  interno en ruta de cliente → `router.replace('/interno')`; cliente en `/interno` → `router.replace('/archivos')`; sin
  sesión → no decide (lo hace `SessionGate` de 002). Luego el Client Component leyendo el contexto de sesión de
  `features/identity/session/` (002). Si 002-PR-5a no está, se escribe contra la forma de PD-42 y se conecta el
  import al integrarlo.
  Archivos: `apps/web/src/features/access/components/require-role.{tsx,spec.tsx}`.

- [ ] **T-53** Grupos `(cliente)` e `(interno)` y área interna — CA: CA-17 — Depende: T-51, T-52, **002-PR-5a** — ~1 h
  Prueba primero `apps/web/src/app/(app)/(interno)/interno/page.spec.tsx`: con sesión falsa de `SUPPORT`, muestra
  `InternalAreaPlaceholder` con `fullName` y «soporte», y «Cerrar sesión» usa la acción de 002. Luego
  `app/(app)/(cliente)/layout.tsx` (`RequireRole allowed={['CLIENT']}`), `app/(app)/(interno)/layout.tsx`
  (`allowed={['ADMIN','SUPPORT','OPERATOR']}`) y `app/(app)/(interno)/interno/page.tsx`, anidados en el `(app)` de 002
  (`cuenta/seguridad` queda fuera de ambos). `/archivos`: si ni 005 ni 002 la crearon, marcador con `StateView` vacío
  «Tus archivos aparecerán aquí» (ver Notas).
  Archivos: `apps/web/src/app/(app)/(cliente)/layout.tsx`, `apps/web/src/app/(app)/(interno)/{layout,interno/page}.tsx`, `apps/web/src/app/(app)/(interno)/interno/page.spec.tsx`, `apps/web/src/app/(app)/(cliente)/archivos/page.tsx` (solo si falta).

- [ ] **T-54** Catálogo de errores `SHARED_*` — CA: CA-17, CA-1 (web) — Depende: T-02, **001 PR-4** — ~0,5 h
  Prueba primero en el `*.spec.ts` de `lib/error-catalog.ts` (001): `SHARED_UNAUTHENTICATED` y `SHARED_FORBIDDEN` tienen
  mensaje en español con acción correctiva; la web no muestra el `message` del servidor. Luego las entradas (los
  códigos importados de `contracts`). La renovación ante 401 es de `auth-fetch` de 002; aquí solo el catálogo.
  Archivos: `apps/web/src/lib/error-catalog.{ts,spec.ts}`.

- [ ] **T-55** **(humana)** Recorrido local y revisión visual — CA: CA-17 — Depende: T-48…T-54, 002-PR-5a — ~1 h
  Con `docker compose up -d` y `pnpm dev`: iniciar sesión como cliente → `/archivos`; como cuenta interna (insertada a
  mano o con el *seed*) → `/interno`; interno abre `/archivos` → vuelve a `/interno`; ruta inexistente →
  `NotFoundState`. Pedir al `ui-designer` la revisión a 360 y 1440 px (produce `ui-review.md`). Si 002 no llegó al
  30/09, la revisión se hace sobre las pruebas de componentes y la redirección real queda para el PR web de 002 (plan
  §11.6).
  Archivos: ninguno (evidencia en `verification.md`).

- [ ] **T-56** Cierre del PR-F y de la spec — CA: todos (trazabilidad) — Depende: T-01…T-55 — ~1 h
  `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:int`, `pnpm test:isolation`, `pnpm env:check` en verde.
  Pedir al `tester` `verification.md` (CA-10, CA-14 y la segunda parte de CA-11 enlazados a 005; CA-13 con `\du`/`\dp`
  de T-34), al `security-auditor` `security.md` (diferencias de tiempo del 404, superficie residual de 15 min, secretos
  de BD) y `/review 003`. Actualizar la fila de 003 en `specs/README.md`. Si PR-D se integra después de PR-F, estos
  documentos se producen con el cierre de PR-D (plan §6.12).
  Archivos: `specs/README.md`, `specs/003-roles-y-acceso/tasks.md`.

## Diferidas (no forman parte de estos PR)

- **CA-10** (dos clientes, listado, búsqueda y descarga; filtro en el SQL con `EXPLAIN`): en el PR de 005 (PD-44,
  provisional). 003 deja la forma del fragmento (T-37) y el lector probado en Postgres (T-38).
- **CA-11 con archivos reales**: en 005. **CA-14** (RLS con `FORCE` en `archivo` y `version_archivo`, sin actor → 0
  filas): en 005, con las funciones `nimbo_actor_*` de T-27.
- **Tokens reales en el mundo de aislamiento y suite de contrato con la implementación real** (antes PR-E): 002-PR-2.
- **E2E** de redirección por rol con Playwright + axe a 360/1440 px: PD-41, Fase 2.
- **Métricas** (`nimbo_shared_auth_denied_total`) y alerta de `undeclared_route`: 022.

## Matriz CA → tareas

| CA | Tareas | CA | Tareas |
|---|---|---|---|
| CA-1 | T-02, T-04, T-08, T-11, T-13, T-15, T-17, T-54 | CA-10 | **con 005**; en 003 solo forma: T-37, T-38 |
| CA-2 | T-05, T-06, T-09, T-12, T-14, T-17 (+ 002-PR-2 con la implementación real) | CA-11 | T-46, T-50 (web); **con 005** con archivos reales |
| CA-3 | T-11, T-45 | CA-12 | T-22, T-27, T-28, T-29, T-30 |
| CA-4 | T-03, T-07, T-12, T-15, T-42 | CA-13 | T-20, T-21, T-23, T-24, T-25, T-26, T-31, T-32, T-34 (manual) |
| CA-5 | T-04, T-10, T-12, T-16, T-42, T-52 (experiencia) | CA-14 | **con 005** (usa T-27) |
| CA-6 | T-04, T-10, T-12, T-16, T-42 | CA-15 | T-25, T-41, T-42, T-43, T-47 |
| CA-7 | T-44, T-45 | CA-16 | T-09, T-10, T-18, T-24 |
| CA-8 | T-35, T-36, T-39 | CA-17 | T-48…T-55 (componentes + jest-axe; sin Playwright, PD-41) |
| CA-9 | T-03, T-36, T-37, T-38, T-43 | | |

Tareas por PR: PR-A = 19 (T-01…T-19) · PR-B = 15 (T-20…T-34) · PR-C = 6 (T-35…T-40) · PR-D = 7 (T-41…T-47) ·
PR-F = 9 (T-48…T-56). Total: 56.

## Notas del developer

- **Precedencia del plan**: donde §11.2 dice «500 estrategia desconocida», «`err` se relanza como 500»,
  `access-token-strategy.ts` como archivo propio o `validate` → `false`, manda «Cambios aplicados»: 401
  `invalid_token`, constante en el archivo del puerto y `[false, { reason }]` (T-05, T-09, T-12).
- **Nombre de la sesión web**: §11.2 (e) habla de `{ id, name, role }`, pero §6.9 y el plan de 002 usan
  `SessionResponse.user.fullName`. Se usa `fullName` (T-51, T-52, T-53).
- **Marcador `/archivos`**: el plan 003 lo pone en PR-F «si 005 no está», y el plan de 002 lo crea «solo si 006 no la
  creó». Lo crea quien integre primero; el otro lo reutiliza (T-53).
- **`not-found.tsx` raíz**: está fuera de `(app)` y no tiene `SessionProvider`, así que muestra siempre «Ir al inicio».
  «Ir a mi inicio» aparece donde `NotFoundState` se usa dentro de `(app)` (p. ej., ante un 404 de la API).
- **Comprobación de mezcla de estrategias (T-13)**: el plan fija el comportamiento, no el mecanismo. Por ejemplo,
  tras compilar, comprobar que la estrategia `ACCESS_TOKEN_STRATEGY` registrada en Passport es la instancia de
  `TestJwtStrategy` del módulo de sonda. En 003 `IdentityModule` no registra estrategia, así que `AppModule` con
  `'test'` no lanza; desde 002-PR-2 esas suites pasan a `'identity'`.
- **Prueba de la migración de permisos (T-26)**: `CREATE/ALTER ROLE` son transaccionales en Postgres, así que los casos
  «falta el rol» y «tiene `BYPASSRLS`» se prueban dentro de una transacción del dueño que se revierte, sin otro
  contenedor.
- **Archivos de prueba que el plan no nombra**: `app-role-script.int-spec.ts` (T-20), `test-app.int-spec.ts` (T-13),
  `access-token-contract.int-spec.ts` (T-14), `isolation-world.iso-spec.ts` (T-41), `index.spec.ts` de `access` (T-39)
  y `roles-contract.spec.ts` en `shared/presentation/auth` (T-04, porque el dominio no importa `contracts`).
- **Versiones de Passport (T-01)**: `@nestjs/jwt@12` y `@nestjs/passport@12` son solo ESM (`"type": "module"`) y
  el `api` compila a CommonJS y prueba con `ts-jest`; se fijan las últimas de la línea 11 (la de `@nestjs/common` 11):
  `@nestjs/jwt@11.0.2`, `@nestjs/passport@11.0.5`, `passport@0.7.0`, `passport-jwt@4.0.1`, `@types/passport-jwt@4.0.1`.
- **Suite de contrato (T-06)**: `describeAccessTokenVerifierContract` recibe una función `() => ({ verifier, tokens,
  clock })` que se evalúa dentro de cada prueba, para que 002 pueda construir su sujeto en un `beforeAll`. Para que
  `test/support/*.spec.ts` corra en `pnpm test`, `apps/api/jest.config.cjs` agrega ese patrón a `testMatch`.
- **`ALL_ROLES` como tupla (T-07)**: el plan §5 lo tipa `readonly Role[]`, pero `@Roles` exige `readonly [Role, ...Role[]]` y el *spread* de un arreglo no la cumple. Se tipa `readonly [Role, ...Role[]]` (mismos valores, congelado; `actor.spec.ts` comprueba que coincide con `Object.values(Role)`). `RequestPrincipal` agrega `require(ctx)`, que usan los dos decoradores de parámetro.
- **Patrón de ruta en las bitácoras (T-08)**: `presentation/auth/route-pattern.ts` (archivo no listado) arma `route` con `método + baseUrl + req.route.path` para `auth.unauthenticated` y `auth.forbidden`; lo comparten los dos guards. Las dos cabeceras `authorization` se detectan en `rawHeaders`, porque Node descarta los duplicados de `authorization` en `headers`.
- <Hallazgos y desviaciones, con enlace al registro de cambios de la spec.>
