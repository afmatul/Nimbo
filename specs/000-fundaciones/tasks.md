# Tareas 000 — Fundaciones: monorepo, contenedores, CI/CD, ambientes, `shared`, salud y fronteras

> Spec: `./spec.md` · Plan: `./plan.md` (Aprobado, §11.0)
> Leyenda: `[P]` paralelizable con otras `[P]` del mismo bloque · Cada tarea ≈ 1–4 h y un commit.
> Dueño: Adrián. Rama por bloque: `feat/000-fundaciones-<bloque>`; un PR por bloque (plan §9b). Commits con
> Conventional Commits y sufijo `[000 T-xx]`.
>
> **Sin pruebas de aislamiento propias**: 000 no crea datos de cliente ni tablas de negocio (plan §2, Art. IX n/a).
> La suite `isolation` solo recibe la prueba marcador que CA-25 exige para poder forzar un fallo en CI (T-25).
> Toda tarea de lógica empieza por su prueba (rojo → verde → refactor). Las tareas marcadas **(humana)** no se
> automatizan: las ejecuta una persona y dejan evidencia en `verification.md`.

## Bloque 1 — PR-1 «esqueleto»: workspace, contratos, apps mínimas, compose local (plan §9b paso 1)

- [x] **T-01** Prueba de estructura + workspace raíz — CA: CA-4 — Depende: — — ~3 h
  Escribir primero `scripts/repo-structure.spec.ts` (Jest raíz: existen `apps/api`, `apps/web`, `apps/worker`,
  `packages/contracts`, `packages/config`, `infra/`, `pnpm-workspace.yaml`, `.nvmrc`, `.env.example`; `package.json`
  raíz expone `dev`, `lint`, `typecheck`, `test`, `test:int`, `test:isolation`, `test:e2e`, `seed`, `env:check`;
  `pnpm-workspace.yaml` no incluye `docs/**`) y verla fallar. Luego crear `package.json` raíz (scripts exactos de plan
  §6.1, `packageManager: pnpm@10.x`, `engines.node: 22.x`, versiones fijas), `pnpm-workspace.yaml` (`apps/*`,
  `packages/*`), `.nvmrc` (`22`), `.npmrc` (`engine-strict=true`), `.gitignore` (`.env`, `node_modules`, `dist`,
  `.next`, `coverage`), `.dockerignore`, `.editorconfig`, `.prettierignore`, `tsconfig.json` raíz (solo `references`),
  `jest.config.cjs` raíz (para `scripts/*.spec.ts`), `scripts/placeholder.mjs` (imprime el mensaje y sale `0`;
  lo usan `test:e2e` y `seed`), `e2e/README.md`, `load/README.md`.
  Archivos: los listados.

- [x] **T-02** `packages/config`: tsconfig, ESLint flat base, Prettier, Jest base — CA: CA-9 — Depende: T-01 — ~3 h
  `packages/config/package.json` (`@nimbo/config`), `tsconfig.base.json` (`strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, ES2022), `tsconfig.nest.json`, `tsconfig.next.json`, `tsconfig.lib.json`,
  `prettier.config.js`, `eslint/base.js` (`@typescript-eslint` strict-type-checked, `eslint-plugin-import-x`,
  `eslint-config-prettier`), `eslint/nest.js` (sin fronteras todavía; las agrega T-28), `eslint/next.js`
  (`next/core-web-vitals`), `jest/base.cjs` (ts-jest, `coverageThreshold` 60 % en `application/` y `domain/`).
  Raíz: `eslint.config.mjs` (importa base; `ignores: ['docs/**', '**/dist/**', '**/.next/**']`) y
  `prettier.config.mjs`. Verificar `pnpm lint` y `pnpm typecheck` en `0` sobre el árbol vacío.
  Archivos: `packages/config/**`, `eslint.config.mjs`, `prettier.config.mjs`.

- [x] **T-03** [P] `packages/contracts`: contratos de salud y error — CA: CA-21, CA-22, CA-33 (contrato), CA-16 (forma de error) — Depende: T-02 — ~2 h
  Prueba primero `packages/contracts/src/health.spec.ts` (`healthReadyResponseSchema` acepta `checks` parcial:
  `{ redis: 'up' }` y los tres; rechaza `status: 'x'`) y `error.spec.ts` (`errorResponseSchema` exige `code`,
  `message`, `correlationId`). Luego `src/health.ts` (`HealthCheckName`, `HealthCheckStatus`, `HealthLiveResponse`,
  `HealthReadyResponse` con `checks: Partial<Record<…>>`, esquemas zod), `src/error.ts` (`ErrorResponse`,
  `errorResponseSchema`), `src/index.ts`, `package.json` (`@nimbo/contracts`, `exports` con `types`, build `tsc`),
  `tsconfig.json`, `jest.config.cjs`.
  Archivos: `packages/contracts/**`.

- [x] **T-04** [P] `apps/api` mínimo con `HealthController.live` — CA: CA-20 (parcial), CA-9 — Depende: T-02 — ~3 h
  Prueba primero `apps/api/src/shared/presentation/health.controller.spec.ts` (`live()` devuelve `{ status: 'ok' }`
  sin dependencias). Luego `apps/api/package.json` (nombre `api`, NestJS 11, TypeORM 0.3, scripts `dev`
  (`nest start --watch`), `build`, `typecheck`, `test`, `test:int`, `test:isolation` — los tres últimos como
  configuraciones vacías que T-18/T-25 rellenan), `tsconfig.json`, `tsconfig.build.json`, `nest-cli.json`,
  `jest.config.cjs`, `src/main.ts` provisional (`setGlobalPrefix('api/v1')`, `listen(PORT ?? 3000)`; T-17 lo
  reemplaza), `src/app.module.ts` (importa `HealthModule`), `src/shared/health.module.ts` (versión mínima con solo el
  controlador; T-20 agrega `forRoot`), `src/shared/presentation/health.controller.ts` (solo `GET health/live`),
  `src/shared/index.ts` (exporta `HealthModule`), `src/shared/README.md`.
  Archivos: `apps/api/**` (excepto `src/modules/**`).

- [x] **T-05** [P] Carpetas de los 12 módulos con `index.ts` vacío y `README.md` mínimo — CA: CA-4, CA-5 (precondición del lint) — Depende: T-02 — ~1 h
  Para cada uno de `identity`, `storage`, `access`, `sharing`, `billing`, `editing`, `intelligence`, `optimizer`,
  `backoffice`, `audit`, `realtime`, `notifications`: `apps/api/src/modules/<m>/index.ts` (`export {};`) y
  `apps/api/src/modules/<m>/README.md` (dueño según `specs/README.md`, diagrama de origen, capas
  `domain/application/infrastructure/presentation`, regla «otros módulos solo importan desde `index.ts`», specs que
  lo construyen). Ningún `*.module.ts` todavía (lo crea la primera spec de cada módulo). Precisión al plan §9b/§12.
  Archivos: `apps/api/src/modules/*/index.ts`, `apps/api/src/modules/*/README.md`.

- [x] **T-06** `apps/worker` mínimo y verificación del alias `@nimbo/api/*` — CA: CA-4, CA-23 (esqueleto) — Depende: T-04 — ~3 h
  `apps/worker/package.json` (nombre `worker`, `dependencies: { api: workspace:* }`, scripts `dev` (`tsx watch
  src/main.ts`), `build` (`tsc -b && tsc-alias`), `typecheck`, `test`), `tsconfig.json` (`paths` `@nimbo/api/*` →
  `../api/src/*`, `references: [../api]`; `apps/api/tsconfig.json` pasa a `composite: true`), `jest.config.cjs`
  (`moduleNameMapper`), `src/main.ts` provisional (crea `WorkerModule`, `listen(WORKER_PORT ?? 3001)`),
  `src/worker.module.ts` (importa `HealthModule` desde `@nimbo/api/shared`), `src/healthcheck.ts` (`fetch` a
  `/health/live`, sale `1` si no es 200). Verificar `pnpm --filter worker build && node dist/main.js` y `tsx`.
  **Decisión R-3**: si el alias falla en build o Jest, aplicar la alternativa aprobada (`apps/api/src/worker.main.ts`
  + `apps/worker` delgado) y anotarlo en «Notas del developer» y en plan §9.
  Archivos: `apps/worker/**`, `apps/api/tsconfig.json`.

- [x] **T-07** [P] `apps/web` mínimo: página de estado — CA: CA-33, CA-29, CA-18 (web) — Depende: T-03 — ~3 h
  Prueba primero `apps/web/src/app/page.spec.tsx` (con `fetch` simulado: `200` → «API: disponible»; error/`503` →
  «API: no disponible. Revisa el estado de los servicios.»; contiene «Nimbo» y `APP_ENV`) y
  `apps/web/src/env.spec.ts` (falta `API_INTERNAL_URL` → issues formateadas sin valores). Luego `apps/web/package.json`
  (nombre `web`, Next.js 15, React 19, scripts `dev` = `next dev -p 3002`, `build`, `start`, `typecheck`, `test`),
  `next.config.ts` (`output: 'standalone'`), `tsconfig.json`, `jest.config.cjs`, `src/env.ts` (zod: `APP_ENV`,
  `API_INTERNAL_URL`, `PORT` default 3002; sin `NEXT_PUBLIC_`), `src/instrumentation.ts` (`register()` valida y, si
  falla, escribe `config.invalid` y `process.exit(1)`), `src/app/layout.tsx` (`lang="es"`, sin CSS),
  `src/app/page.tsx` (Server Component, `cache: 'no-store'`, `AbortSignal.timeout(3000)`, muestra `x-nimbo-version`
  si llega), `src/lib/api-health.ts` (tipado con `HealthReadyResponse`), `public/` vacío.
  Archivos: `apps/web/**`.

- [x] **T-08** `.env.example` completo — CA: CA-19 (archivo), CA-1 — Depende: T-04, T-06, T-07 — ~1 h
  Todas las variables del plan §6.2 y §6.5: `NODE_ENV`, `APP_ENV`, `APP_VERSION`, `PORT`, `WORKER_PORT`, `LOG_LEVEL`,
  `DATABASE_URL`, `REDIS_URL`, `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`, `MINIO_REGION`,
  `API_INTERNAL_URL`, `POSTGRES_USER/PASSWORD/DB`, `MINIO_ROOT_USER/PASSWORD`, `IMAGE_TAG`, `DOMAIN`, `WEB_HOST`,
  `API_HOST`, `DOCS_HOST`, `S3_HOST`, `LETSENCRYPT_EMAIL`, `ACME_CA_SERVER`, `ONLYOFFICE_JWT_SECRET`,
  `API_MEM_LIMIT`, `WORKER_MEM_LIMIT`, `COMPOSE_FILE` (comentada; solo staging). Valores locales; secretos de staging
  vacíos; comentario por variable en español. Sin `NEXT_PUBLIC_*`.
  Archivos: `.env.example`.

- [x] **T-09** `compose.yml` base + `compose.override.yml` local + Traefik local + MinIO init — CA: CA-1, CA-2, CA-3 — Depende: T-08 — ~4 h
  `compose.yml` (postgres `pgvector/pgvector:pg17`, redis, minio + `minio-init`, traefik v3, api, worker, web,
  onlyoffice bajo `profiles: [onlyoffice]`; healthchecks, `depends_on: service_healthy`, `mem_limit`, volúmenes
  nombrados; `WORKER_PORT` nunca en `ports:`), `compose.override.yml` (puertos publicados 5432/6379/9000/9001/8025/1025/8080,
  `mailpit`, apps con `profiles: [apps]`, `extra_hosts: host.docker.internal:host-gateway`, Traefik enruta `/` →
  host:3002, `/api` → host:3000, `/docs` → onlyoffice con `stripprefix`, `/s3` → minio),
  `infra/traefik/traefik.local.yml`, `infra/minio/init.sh` (`mc mb --ignore-existing`, `mc version enable`).
  Verificar: `docker compose config --services` sin perfil = `postgres redis minio minio-init traefik mailpit`
  (no `onlyoffice`); con `--profile onlyoffice` lo incluye; `docker compose up -d` y `http://localhost/docs/healthcheck`
  con el perfil → `true`.
  Archivos: `compose.yml`, `compose.override.yml`, `infra/traefik/traefik.local.yml`, `infra/minio/init.sh`.

- [x] **T-10** `README.md` raíz (arranque desde cero) y CLAUDE.md «Comandos del repositorio» — CA: CA-1, CA-4 — Depende: T-09 — ~2 h
  README: requisitos (Git, Docker Compose v2, Node 22 vía `.nvmrc`, pnpm por corepack), los cinco comandos exactos de
  CA-1 en orden, URLs resultantes (`http://localhost`, `http://localhost/api/v1/health/ready`, Mailpit `:8025`,
  Traefik `:8080`), perfil `onlyoffice`, puertos 3000/3001/3002, enlaces a `docs/operations/*`. CLAUDE.md: quitar la
  nota «Aún no existe `package.json` raíz», agregar `pnpm env:check` y la nota de perfiles de compose.
  Cronometrar el arranque en una máquina limpia y registrar en `verification.md` (CA-1, se repite al cerrar PR-2).
  Archivos: `README.md`, `CLAUDE.md`, `specs/000-fundaciones/verification.md` (creado por `tester` con la plantilla si no existe).

## Bloque 2 — PR-2 «shared»: dominio, infraestructura, salud, cola `ping`, migraciones (plan §9b paso 2)

- [x] **T-11** `shared/domain`: `Actor`, `Role`, `IClock`, `FixedClock`, `DomainError` y subclases — CA: CA-17 — Depende: T-04 — ~2 h
  Pruebas primero: `apps/api/src/shared/domain/fixed.clock.spec.ts` (`now()` devuelve la fecha fijada, `advance()`),
  `errors/domain-error.spec.ts` (cada subclase expone `code` y `message`; `instanceof DomainError`),
  `apps/api/src/shared/index.spec.ts` (CA-17: exporta exactamente la lista de plan §6.2; `keyof Actor` =
  `'id' | 'role' | 'canReadContent'` con `Expect<Equal<…>>`). Luego `domain/actor.ts`, `domain/role.enum.ts`,
  `domain/i-clock.port.ts` (`IClock`, `I_CLOCK`), `domain/fixed.clock.ts`, `domain/errors/{domain-error,
  invalid-input.error, unauthorized.error, forbidden.error, not-found.error, conflict.error, index}.ts`,
  `infrastructure/clock/system.clock.ts`; `index.ts` se amplía. `index.spec.ts` queda rojo en las exportaciones que
  llegan en T-13…T-22 (usar `it.todo` por bloque y activarlas en cada tarea).
  Archivos: `apps/api/src/shared/domain/**`, `apps/api/src/shared/infrastructure/clock/system.clock.ts`, `apps/api/src/shared/index.ts`, `apps/api/src/shared/index.spec.ts`.

- [x] **T-12** [P] Logger Pino con redacción profunda — CA: CA-15, CA-13 (campo `correlationId` por `mixin`) — Depende: T-11 — ~3 h
  Prueba primero `apps/api/src/shared/infrastructure/logging/redact-deep.spec.ts` (objeto anidado con los 13 campos +
  `headers.authorization`, arreglos, ciclos, profundidad 17 → truncado; valores → `[REDACTED]`; resto intacto;
  insensible a mayúsculas; microbenchmark < 50 µs) y `logger.options.spec.ts` (línea escrita a destino en memoria
  incluye `correlationId` del `CorrelationContext` y aplica `redactDeep`). Luego `redacted-fields.ts`
  (`REDACTED_FIELDS` = los 13 de CA-15 ∪ `SECRET_KEYS`), `redact-deep.ts`, `logger.options.ts` (`mixin`,
  `hooks.logMethod`, `redact.paths` de cabeceras, `genReqId`/`customProps`), `logger.module.ts` (`nestjs-pino`).
  Archivos: `apps/api/src/shared/infrastructure/logging/**`, `apps/api/src/shared/index.ts`.

- [x] **T-13** [P] Validación de entorno con zod (`loadEnv` puro) — CA: CA-18, CA-19 (esquema) — Depende: T-11 — ~3 h
  Prueba primero `apps/api/src/shared/infrastructure/config/load-env.spec.ts` (falta `DATABASE_URL` → `{ ok: false,
  issues: ['`DATABASE_URL` es obligatoria'] }`; `PORT=abc` → «`PORT` debe ser un entero entre 1 y 65535»; varios
  errores → todos en una lista; `ok: true` devuelve `env` tipado con defaults; el texto de issues nunca contiene el
  valor de `MINIO_SECRET_KEY`; `workerEnvSchema` no exige `MINIO_*`). Luego `env.schema.ts` (`apiEnvSchema`,
  `workerEnvSchema`, `SECRET_KEYS`, tipo `Env`), `load-env.ts`, `env-report.ts` (`formatEnvIssues`).
  Archivos: `apps/api/src/shared/infrastructure/config/**`, `apps/api/src/shared/index.ts`.

- [x] **T-14** `CorrelationContext`, `CorrelationIdMiddleware`, `VersionHeaderMiddleware` — CA: CA-13, CA-31 (cabecera de versión) — Depende: T-12 — ~2 h
  Pruebas primero `apps/api/src/shared/infrastructure/correlation/correlation-context.spec.ts`
  (`isValidCorrelationId`: acepta `^[\x21-\x7E]{1,128}$`, rechaza vacío, 129 caracteres, espacios, no-ASCII;
  `run()`/`get()` aíslan contextos concurrentes), `correlation-id.middleware.spec.ts` (sin cabecera → UUID v4 en
  respuesta y en contexto; válida → eco; inválida → nueva sin error) y
  `presentation/version-header.middleware.spec.ts` (`x-nimbo-version` = `APP_VERSION`). Luego los tres archivos.
  Archivos: `apps/api/src/shared/infrastructure/correlation/**`, `apps/api/src/shared/presentation/version-header.middleware.ts`, `apps/api/src/shared/index.ts`.

- [x] **T-15** TypeORM: `buildDataSourceOptions`, `data-source.cli.ts`, migración inicial, `migrate.ts`, scripts — CA: CA-10, CA-11, CA-12 — Depende: T-13 — ~3 h
  Prueba primero `apps/api/src/shared/infrastructure/persistence/data-source.spec.ts` (CA-10: con
  `TYPEORM_SYNCHRONIZE=true` y `NODE_ENV=development`, `synchronize === false`; `migrationsTableName === 'migracion'`;
  importar `shared/index.ts` no lee `process.env` ni construye `DataSource` — espiar `process.env` con un Proxy).
  Luego `data-source.ts` (pura), `apps/api/src/migrations/data-source.cli.ts` (`requireEnv()` + `AppDataSource`, no
  reexportado), `apps/api/src/migrations/20260915120000-crear-extension-vector.ts` (`up`: `CREATE EXTENSION IF NOT
  EXISTS vector`; `down`: `DROP EXTENSION IF EXISTS vector`), `apps/api/src/scripts/migrate.ts` (`run|revert`,
  `transaction: 'each'`, bitácoras `migration.run`/`migration.revert`, exit `1` en fallo),
  `apps/api/scripts/migration-generate.mjs` (timestamp `YYYYMMDDHHmmss`, `-d src/migrations/data-source.cli.ts`),
  scripts `migration:generate|run|revert` en `apps/api/package.json`. Verificar a mano contra el Postgres del compose:
  `run` → extensión presente y 1 fila en `migracion`; `revert` → ausente y 0 filas; `run` de nuevo.
  Archivos: `apps/api/src/shared/infrastructure/persistence/**`, `apps/api/src/migrations/**`, `apps/api/src/scripts/migrate.ts`, `apps/api/scripts/migration-generate.mjs`, `apps/api/package.json`, `apps/api/src/shared/index.ts`.

- [x] **T-16** `SharedModule` y `main.ts` definitivo de `api` (bootstrap con `loadEnv`, logger, middlewares) — CA: CA-18, CA-13, CA-1 (`api.started`) — Depende: T-12, T-13, T-14, T-15 — ~3 h
  Prueba primero `apps/api/test/int/shared/bootstrap.int-spec.ts` (lanza `node dist/main.js` o `tsx src/main.ts` como
  subproceso con `.env` sin `DATABASE_URL`: código ≠ 0, exactamente una línea `config.invalid` en stderr con las
  issues, ningún puerto abierto; requiere el arnés de T-17, así que se escribe aquí y se activa en T-17). Luego
  `shared.module.ts` (provee `ENV` desde `loadEnv`, `LoggerModule`, `TypeOrmModule.forRootAsync` con
  `buildDataSourceOptions` + `autoLoadEntities`, `retryAttempts: 10`, `retryDelay: 3000`, `BullModule.forRoot` con
  `REDIS_URL`), `app.module.ts` (composición: `SharedModule`, `HealthModule`), `main.ts` (`loadEnv(apiEnvSchema)` →
  si `!ok` escribe `config.invalid` y `process.exit(1)` → `NestFactory.create` con logger Pino → `app.use(
  CorrelationIdMiddleware, VersionHeaderMiddleware)` → `setGlobalPrefix('api/v1')` → `listen(PORT)` →
  bitácora `api.started { port, appEnv, version }`).
  Archivos: `apps/api/src/shared/shared.module.ts`, `apps/api/src/app.module.ts`, `apps/api/src/main.ts`, `apps/api/test/int/shared/bootstrap.int-spec.ts`, `apps/api/src/shared/index.ts`.

- [x] **T-17** Arnés de integración (Testcontainers) + prueba de `correlationId` HTTP — CA: CA-13, CA-24 (`int` real) — Depende: T-16 — ~4 h
  `apps/api/jest.int.config.ts` (`testMatch: test/int/**/*.int-spec.ts`, `globalSetup/globalTeardown`),
  `apps/api/test/int/setup/global-setup.ts` (arranca `@testcontainers/postgresql` con `pgvector/pgvector:pg17`,
  `@testcontainers/redis`, `GenericContainer('minio/minio')`; exporta `DATABASE_URL`/`REDIS_URL`/`MINIO_*` y guarda
  los ids para detenerlos desde las pruebas), `test/int/setup/global-teardown.ts`, `test/int/setup/test-app.ts`
  (`createTestApp({ modules?, controllers? })` con logger a destino en memoria `test/int/setup/log-sink.ts`).
  Prueba `test/int/shared/correlation-id.int-spec.ts` (CA-13: sin cabecera → `x-correlation-id` UUID v4 y todas las
  líneas de bitácora de la petición lo llevan; con cabecera válida → eco; inválida → nueva, `200`). Activar
  `bootstrap.int-spec.ts` de T-16. Script `test:int` en `apps/api/package.json`.
  Archivos: `apps/api/jest.int.config.ts`, `apps/api/test/int/setup/**`, `apps/api/test/int/shared/correlation-id.int-spec.ts`, `apps/api/package.json`.

- [x] **T-18** `DomainExceptionFilter` con prueba de API — CA: CA-16 — Depende: T-17 — ~3 h
  Prueba primero `apps/api/test/int/shared/domain-exception-filter.int-spec.ts` (controlador de prueba definido en
  el spec lanza `SharedExampleNotFoundError extends NotFoundError` con `code = 'SHARED_EXAMPLE_NOT_FOUND'` → `404`,
  cuerpo exacto `{ code, message en español con acción, correlationId de la petición }`, sin `stack`/nombre de
  clase/rutas; `Error` genérico → `500` `INTERNAL_ERROR` con mensaje genérico y `correlationId`, y bitácora
  `http.unhandled_error` con `err`; `BadRequestException` de `ValidationPipe` → `400` `VALIDATION_FAILED`;
  `ConflictError` → `409`, `InvalidInputError` → `422`, `UnauthorizedError` → `401`, `ForbiddenError` → `403`).
  Luego `apps/api/src/shared/presentation/domain-exception.filter.ts` (`@Catch()`, mapa por `instanceof`,
  bitácoras `http.domain_error`/`http.unhandled_error`) y registro en `main.ts` con `useGlobalFilters`.
  Archivos: `apps/api/src/shared/presentation/domain-exception.filter.ts`, `apps/api/src/main.ts`, `apps/api/test/int/shared/domain-exception-filter.int-spec.ts`, `apps/api/src/shared/index.ts`.

- [x] **T-19** `HealthService` + `IHealthIndicator` (application) y `HealthModule.forRoot` — CA: CA-21, CA-22 (lógica) — Depende: T-11 — ~2 h
  Prueba primero `apps/api/src/shared/application/health/health.service.spec.ts` (indicadores falsos: todos `up` →
  `{ status: 'ok', checks }`; uno rechaza → `down` y `status: 'error'`; uno tarda > 1500 ms → `down` sin esperar más
  de ~1600 ms, con `FixedClock`/temporizadores falsos; el resultado nunca contiene el mensaje del error; `checks`
  solo con los indicadores registrados). Luego `i-health-indicator.port.ts` (`IHealthIndicator`,
  `I_HEALTH_INDICATORS`), `health.service.ts`, `apps/api/src/shared/health.module.ts` (`forRoot({ indicators:
  Type<IHealthIndicator>[] })` provee `I_HEALTH_INDICATORS` y `HealthService`, declara `HealthController`).
  Archivos: `apps/api/src/shared/application/health/**`, `apps/api/src/shared/health.module.ts`, `apps/api/src/shared/index.ts`.

- [ ] **T-20** Indicadores Postgres/Redis/MinIO + `HealthController.ready` + prueba de API de salud — CA: CA-20, CA-21, CA-22 — Depende: T-17, T-19 — ~4 h
  Prueba primero `apps/api/test/int/shared/health.int-spec.ts` (arranca con los tres contenedores: `ready` → `200`
  con cuerpo exacto `{ status: 'ok', checks: { postgres: 'up', redis: 'up', minio: 'up' } }` en < 2 s (CA-21);
  detener Redis → `503` `{ status: 'error', checks: { …redis: 'down'… } }` en < 3 s y el cuerpo no contiene
  `localhost`, `127.0.0.1`, puertos, `MINIO_`, `Error`, `ECONNREFUSED` (CA-22); detener los tres → `live` sigue
  `200 { status: 'ok' }` en < 100 ms (CA-20, cambio 9); bitácora `health.ready` solo cuando hay `error`). Luego
  `infrastructure/health/postgres.health-indicator.ts` (`SELECT 1`), `redis.health-indicator.ts` (`PING`),
  `minio.health-indicator.ts` (`HeadBucket` con `@aws-sdk/client-s3`), `GET health/ready` en `health.controller.ts`
  (`@HttpCode` 200/503 según `status`), `app.module.ts` con `HealthModule.forRoot({ indicators: [los tres] })`.
  Archivos: `apps/api/src/shared/infrastructure/health/**`, `apps/api/src/shared/presentation/health.controller.ts`, `apps/api/src/app.module.ts`, `apps/api/test/int/shared/health.int-spec.ts`, `apps/api/src/shared/index.ts`.

- [ ] **T-21** Cola `ping`: `enqueueWithCorrelation`, `PingQueue`, `PingProcessor` y prueba de propagación — CA: CA-14 — Depende: T-14, T-17 — ~3 h
  Pruebas primero `apps/api/src/shared/infrastructure/queue/enqueue-with-correlation.spec.ts` (toma el
  `correlationId` del contexto; sin contexto genera UUID; no sobrescribe el resto de `data`) y
  `apps/api/test/int/shared/ping-queue.int-spec.ts` (Redis real: encola dentro de `CorrelationContext.run({ correlationId: 'X' })`;
  un `Worker` de BullMQ con `PingProcessor` lo procesa; todas las líneas `job.started`/`job.completed` llevan
  `correlationId: 'X'` y `jobId`; un trabajo encolado sin `correlationId` produce uno propio; bitácora
  `queue.enqueued`). Luego `bull.config.ts`, `enqueue-with-correlation.ts`, `ping.queue.ts`, `ping.processor.ts`
  (`@Processor('ping')`, `CorrelationContext.run({ correlationId: job.data.correlationId ?? randomUUID(), jobId })`),
  `app.module.ts` registra la cola `ping` y `PingQueue`.
  Archivos: `apps/api/src/shared/infrastructure/queue/**`, `apps/api/src/app.module.ts`, `apps/api/test/int/shared/ping-queue.int-spec.ts`, `apps/api/src/shared/index.ts` (exporta `enqueueWithCorrelation`, `PingProcessor`; no `PingQueue`).

- [ ] **T-22** `apps/worker` definitivo: composición, `loadEnv`, salud interna y `worker.started` — CA: CA-23, CA-18 (worker), CA-1, CA-14 — Depende: T-20, T-21, T-06 — ~3 h
  Pruebas primero `apps/worker/jest.int.config.ts` + `apps/worker/test/int/worker-health.int-spec.ts` (con Redis
  arriba `GET /health/ready` en `WORKER_PORT` → `200 { status: 'ok', checks: { redis: 'up' } }`; detener Redis →
  `503` `{ …redis: 'down' }`; `healthcheck.ts` sale `1`) y `apps/worker/test/int/bootstrap.int-spec.ts` (sin
  `REDIS_URL` → exit ≠ 0, una línea `config.invalid`). Luego `src/main.ts` (`loadEnv(workerEnvSchema)` → exit si
  `!ok` → `NestFactory.create(WorkerModule)` → `listen(WORKER_PORT)` → bitácora `worker.started { appEnv, version,
  queues: ['ping'] }`), `src/worker.module.ts` (`SharedModule`, `HealthModule.forRoot({ indicators:
  [RedisHealthIndicator] })`, `BullModule.registerQueue('ping')`, `PingProcessor`), `src/healthcheck.ts` a
  `/health/ready`. Verificar que `apps/worker/src` solo tiene esos tres archivos.
  Archivos: `apps/worker/src/**`, `apps/worker/jest.int.config.ts`, `apps/worker/test/int/**`, `apps/worker/package.json`.

- [ ] **T-23** [P] `scripts/check-env-example.ts` + script `env:check` — CA: CA-19 — Depende: T-13, T-08 — ~2 h
  Prueba primero `scripts/check-env-example.spec.ts` (variable del esquema ausente en `.env.example` → falla y la
  nombra; clave de `SECRET_KEYS` con prefijo `NEXT_PUBLIC_` → falla; archivo completo → `0`). Luego el script (lee
  `apiEnvSchema`, `workerEnvSchema` y el esquema de `apps/web/src/env.ts`; compara con las claves de `.env.example`).
  Archivos: `scripts/check-env-example.ts`, `scripts/check-env-example.spec.ts`, `package.json` raíz.

- [ ] **T-24** [P] Suite `isolation` marcador — CA: CA-25 (marcador forzable), CA-24 — Depende: T-17 — ~1 h
  `apps/api/jest.isolation.config.ts` (`testMatch: test/isolation/**/*.iso-spec.ts`, mismo `globalSetup`),
  `apps/api/test/isolation/placeholder.iso-spec.ts` (`it('CA-25: la suite de aislamiento puede forzarse a fallar', …)`
  que falla si `ISOLATION_FORCE_FAIL=1`; comentario: «000 no tiene datos de cliente; 003 agrega las pruebas reales»),
  script `test:isolation`.
  Archivos: `apps/api/jest.isolation.config.ts`, `apps/api/test/isolation/placeholder.iso-spec.ts`, `apps/api/package.json`.

- [ ] **T-25** [P] `docs/operations/ambientes.md` — CA: CA-3, CA-18, CA-29 — Depende: T-09, T-13 — ~2 h
  `APP_ENV`/`NODE_ENV` por ambiente, tabla de variables (quién la usa: api/worker/web/compose; secreta o no), tabla
  de diferencias `compose.yml` / `compose.override.yml` / `compose.staging.yml` limitada a lo que CA-3 permite,
  requisito de arranque (Postgres y Redis alcanzables; `retryAttempts: 10`, `retryDelay: 3000`; `depends_on:
  service_healthy`), semántica de `live` vs `ready`, salud del worker en `WORKER_PORT` sin publicar.
  Archivos: `docs/operations/ambientes.md`.

- [ ] **T-26** Cierre del PR-2: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:int` en verde, CA-1 cronometrado de nuevo — CA: CA-1, CA-9 — Depende: T-11…T-25 — ~1 h
  Repetir el arranque desde cero con `pnpm dev` (api, worker, web) y comprobar `worker.started` con `correlationId`,
  `http://localhost/api/v1/health/ready` = `200`, página de estado «API: disponible». Registrar tiempo y salidas en
  `verification.md`. Actualizar `specs/README.md` a `En implementación` si aún no se hizo.
  Archivos: `specs/000-fundaciones/verification.md`, `specs/README.md`.

## Bloque 3 — Compuerta de ADR/DF (plan §9a; humana, bloquea el **merge** del PR-3, no su apertura)

- [ ] **T-27** **(humana)** Reunión del equipo: aceptar ADR y DF — CA: CA-5, CA-6, CA-7 (lista de módulos del lint) — Depende: — — ~1 h de reunión
  `architect` redacta `docs/adr/0010-separacion-de-modulos.md` con `/adr` antes de la reunión. El equipo (los cuatro)
  pasa a `Aceptado` ADR-0001, 0002, 0008, 0009, 0010 y 0015 en `docs/adr/README.md` y en cada ADR, y marca
  `Aceptado` DF-02, DF-03, DF-30, DF-34, DF-06, DF-23, DF-24 en `docs/sdd/design-findings.md`. Si la lista de módulos
  de ADR-0010 difiere de `architecture.md` §3, `architect` ajusta `packages/config/eslint/boundaries.js` (T-28) en el
  mismo PR-3. Evidencia: acta breve en `verification.md` (fecha, asistentes, decisiones).
  Archivos (los edita `architect`, no `developer`): `docs/adr/*.md`, `docs/adr/README.md`, `docs/sdd/design-findings.md`.

## Bloque 4 — PR-3 «CI»: lint de fronteras, seis jobs, gitleaks, protección de `main` (plan §9b paso 4)

- [ ] **T-28** Lint de fronteras entre módulos y capas (fixtures primero) — CA: CA-5, CA-6 — Depende: T-05, T-27 (para el merge) — ~4 h
  Escribir primero `packages/config/eslint/boundaries.spec.ts` (ejecuta `ESLint.lintFiles` sobre
  `packages/config/eslint/__fixtures__/`, afirma `ruleId` y mensaje) con fixtures `cross-module-internal.ts`
  (falla: «`sharing` solo puede importar de `storage` desde `modules/storage/index.ts`»), `cross-module-index.ts`
  (pasa), `domain-imports-nest.ts`, `domain-imports-typeorm.ts`, `domain-imports-zod.ts` (lista blanca),
  `application-imports-infra.ts`; verlos fallar/pasar al revés. Luego `packages/config/eslint/boundaries.js`
  (`eslint-plugin-boundaries`: elementos `shared`, `module`, `layer`, `entry`, `composition`; objeto `allowed` con el
  DAG de `architecture.md` §3 / ADR-0010; `eslint-import-resolver-typescript` para `@nimbo/api/*`), integrarlo en
  `eslint/nest.js` para `apps/api/src/**` **y** `apps/worker/src/**`.
  Archivos: `packages/config/eslint/boundaries.js`, `packages/config/eslint/nest.js`, `packages/config/eslint/boundaries.spec.ts`, `packages/config/eslint/__fixtures__/**`, `packages/config/package.json`, `packages/config/jest.config.cjs`.

- [ ] **T-29** Ciclos, worker y mockups en el lint — CA: CA-7, CA-8, CA-5 (worker) — Depende: T-28 — ~2 h
  Fixtures primero: `cycle-a/index.ts` ↔ `cycle-b/index.ts` (mensaje con los módulos implicados),
  `worker-imports-internal.ts` (simula `apps/worker/src` importando `@nimbo/api/modules/storage/infrastructure/persistence/archivo.orm-entity`),
  `web-imports-mockup.tsx` (mensaje «Los mockups son solo referencia»). Luego `import-x/no-cycle` (`maxDepth: 6`)
  en `eslint/nest.js` para ambas apps y `no-restricted-imports` (`**/docs/design/mockups/**`, `@mockups/*`) en
  `eslint/next.js`.
  Archivos: `packages/config/eslint/nest.js`, `packages/config/eslint/next.js`, `packages/config/eslint/__fixtures__/**`, `packages/config/eslint/boundaries.spec.ts`.

- [ ] **T-30** [P] Regla `typeorm-columns.js` (DF-06/23/24) — CA: n/a (plan §3, spec §13) — Depende: T-27 — ~1 h
  Fixture primero `typeorm-int-bytes.ts` (`@Column({ type: 'int' }) sizeBytes` → falla) y `typeorm-numeric-cents.ts`
  (`type: 'numeric'` en `amountCents` → falla). Luego `packages/config/eslint/typeorm-columns.js`
  (`no-restricted-syntax` con selectores) incluido en `eslint/nest.js`.
  Archivos: `packages/config/eslint/typeorm-columns.js`, `packages/config/eslint/nest.js`, `packages/config/eslint/__fixtures__/**`, `packages/config/eslint/boundaries.spec.ts`.

- [ ] **T-31** `.github/workflows/ci.yml` con los seis jobs — CA: CA-24, CA-9, CA-11, CA-2 (config check), CA-19, CA-27 (paso gitleaks) — Depende: T-28, T-29, T-23, T-24 — ~4 h
  Jobs con nombres exactos `lint` (checkout `fetch-depth: 0` → `gitleaks/gitleaks-action@v2` → `pnpm lint` →
  `pnpm env:check` → `docker compose config --services` sin perfil no contiene `onlyoffice` y con `--profile
  onlyoffice` sí), `typecheck`, `unit` (`pnpm test -- --coverage`, artefacto), `int` (`pnpm test:int`, Testcontainers),
  `isolation` (`pnpm test:isolation`), `migrations` (`services.postgres: pgvector/pgvector:pg17`;
  `migration:run` → `psql` afirma `pg_extension` y `count(*) FROM migracion = 1` → `migration:revert` → afirma
  ausencia y 0 → `migration:run` → afirma). `concurrency` con `cancel-in-progress: true` por rama, `timeout-minutes: 15`,
  caché pnpm, `on: pull_request` y `push: main` **únicamente** (sin `push` de ramas: cuota de 3 000 min/mes de GitHub Pro,
  spec §12). Medir duración total (< 15 min) y registrar en `verification.md`.
  Archivos: `.github/workflows/ci.yml`, `.github/pull_request_template.md`.

- [ ] **T-32** **(humana)** gitleaks sobre el historial completo y `security.md` — CA: CA-27 — Depende: T-31 — ~1 h
  Ejecutar `gitleaks detect --source . --log-opts=--all` en local al activar el CI (el repositorio es privado, D-2);
  adjuntar salida en `specs/000-fundaciones/security.md` (plantilla del `security-auditor`). Si hay hallazgos: rotar el
  secreto y reescribir el historial (posible mientras siga privado). Repetir si el repositorio se hace público algún día.
  Archivos: `specs/000-fundaciones/security.md`.

- [ ] **T-33** **(humana)** Protección de `main` en GitHub — CA: CA-26, CA-24 — Depende: T-31 — ~1 h
  PR obligatorio; status checks requeridos `lint`, `typecheck`, `unit`, `int`, `isolation`, `migrations`; 1
  aprobación de integrante distinto del autor; *dismiss stale reviews*; sin *force push*; solo *squash merge*;
  historial lineal. Ensayar los cuatro rechazos de CA-26 y capturar pantallas en `verification.md`. Documentar en
  `docs/operations/despliegue.md` §«Protección de main» (archivo lo crea T-40; aquí solo la sección, o dejarla en
  `verification.md` hasta T-40).
  Archivos: configuración de GitHub (no versionada), `specs/000-fundaciones/verification.md`.

- [ ] **T-34** **(humana)** Ensayo «CI falla cuando debe» — CA: CA-25, CA-12, CA-27 — Depende: T-31, T-33 — ~2 h
  Una rama de prueba con seis commits (o seis PRs): violación de fronteras (CA-5), error de tipos, unitaria roja,
  integración roja, `ISOLATION_FORCE_FAIL=1`, migración con `down` vacío (CA-12), más un commit con una clave privada
  ficticia (CA-27). Registrar enlace a cada corrida y el estado «merge deshabilitado» en `verification.md`. Cerrar
  la rama sin mergear.
  Archivos: `specs/000-fundaciones/verification.md`.

## Bloque 5 — PR-4 «imágenes»: Dockerfiles y publicación en ghcr.io (plan §9b paso 5)

- [ ] **T-35** `Dockerfile` de `api` y `worker` (multietapa, sin root, `HEALTHCHECK`) — CA: CA-28, CA-23 (HEALTHCHECK), CA-31 (`APP_VERSION`) — Depende: T-22 — ~4 h
  `apps/api/Dockerfile` y `apps/worker/Dockerfile` (etapas `base`/`deps`/`build`/`prod` con `pnpm deploy --prod`/
  `runtime`; `USER node`; `ENV NODE_ENV=production`; `ARG APP_VERSION` → `ENV`; `HEALTHCHECK --interval=20s
  --timeout=5s --retries=2 --start-period=30s CMD node dist/healthcheck.js`; `CMD ["node","dist/main.js"]`);
  `apps/api/src/healthcheck.ts` (a `/api/v1/health/live`). Verificar local: `docker build`, `docker run --rm <img>
  id -u` ≠ 0, imagen sin `devDependencies` (`ls node_modules/.pnpm | grep -c jest` = 0), tamaño anotado,
  `docker inspect` muestra `healthy`; con Redis detenido, `unhealthy` en < 60 s (CA-23).
  Archivos: `apps/api/Dockerfile`, `apps/worker/Dockerfile`, `apps/api/src/healthcheck.ts`, `.dockerignore`.

- [ ] **T-36** [P] `Dockerfile` de `web` (standalone, sin root, sin valores horneados) — CA: CA-28, CA-29 — Depende: T-07 — ~2 h
  `apps/web/Dockerfile` (`output: 'standalone'`, `USER node`, `HOSTNAME=0.0.0.0`, `PORT=3002`, `CMD ["node","server.js"]`).
  Verificar `grep -r NEXT_PUBLIC_ .next/standalone` vacío y que la misma imagen con `API_INTERNAL_URL` distinto
  cambia el resultado sin rebuild.
  Archivos: `apps/web/Dockerfile`.

- [ ] **T-37** `.github/workflows/build-publish.yml` — CA: CA-28, CA-29 — Depende: T-35, T-36 — ~3 h
  Matriz `api|worker|web`; `docker/metadata-action` (`ghcr.io/afmatul/nimbo-<app>`, `sha-<short>` y `latest` solo en
  `main`); `build-push-action` con `push` solo fuera de `pull_request`, `build-args: APP_VERSION=sha-<short>`, caché
  `gha`; pasos de verificación: `docker run --rm <img> id -u` ≠ 0 y `grep NEXT_PUBLIC_` en `web`. Permisos
  `packages: write`. Paso final de retención con `actions/delete-package-versions` (conservar `latest` y las últimas 5
  versiones por app; cuota de 2 GB de Packages en repo privado, spec §12). Verificar en ghcr.io las seis etiquetas tras
  el merge y registrar en `verification.md`.
  Archivos: `.github/workflows/build-publish.yml`.

## Bloque 6 — PR-5 «staging»: compose de staging, Traefik TLS, deploy transaccional, rollback (plan §9b paso 6)

- [ ] **T-38** `compose.staging.yml` + Traefik con Let's Encrypt y cabeceras — CA: CA-3, CA-32, CA-30 (TLS) — Depende: T-09 — ~4 h
  `compose.staging.yml` (sin `build`; imágenes `${IMAGE_TAG}`; sin `ports` en postgres/redis/minio; Traefik `80`/`443`;
  enrutadores por `Host()` con `WEB_HOST`/`API_HOST`/`DOCS_HOST`; enrutador `S3_HOST` definido con
  `traefik.enable=false` y comentario «lo activa 005»; middleware `secure-headers` en web/api; `onlyoffice` con
  `SAMEORIGIN`; volúmenes en `/srv/nimbo/*`; `restart: unless-stopped`; logging rotado; `API_MEM_LIMIT`/
  `WORKER_MEM_LIMIT`), `infra/traefik/traefik.staging.yml` (redirección 80→443, `letsencrypt` HTTP-01,
  `caServer=${ACME_CA_SERVER}`, `acme.json`), `infra/traefik/dynamic/headers.yml` (HSTS 1 año + subdominios +
  preload, `nosniff`, `frameDeny`, `Referrer-Policy strict-origin-when-cross-origin`). Verificar `docker compose -f
  compose.yml -f compose.staging.yml config` y que las diferencias con local son solo las de CA-3 (tabla en
  `ambientes.md`, T-25).
  Archivos: `compose.staging.yml`, `infra/traefik/traefik.staging.yml`, `infra/traefik/dynamic/headers.yml`, `docs/operations/ambientes.md`.

- [ ] **T-39** `infra/deploy/deploy.sh` y `rollback.sh` transaccionales (prueba con `docker` simulado primero) — CA: CA-30, CA-31 — Depende: T-15 — ~3 h
  Prueba primero `infra/deploy/deploy.spec.sh` (bash; coloca un `docker` falso en `PATH` que registra las llamadas y
  puede fallar en `run … migrate.js run` o en `up -d`): (a) migración falla → `.env` intacto, no hubo `up -d`, código
  ≠ 0; (b) `up -d` falla tras el `sed` → `IMAGE_TAG` restaurado por el `trap`; (c) éxito → `.previous-tag` contiene
  la etiqueta anterior, `.env` con la nueva, orden `pull → run migrate → sed → up -d → curl`. Se ejecuta con
  `pnpm test:deploy-scripts` (script raíz opcional, también en el job `unit`). Luego `deploy.sh` exactamente como
  plan §6.6 y `rollback.sh [tag]` (`sed` + `pull` + `up -d`, sin migraciones).
  Archivos: `infra/deploy/deploy.sh`, `infra/deploy/rollback.sh`, `infra/deploy/deploy.spec.sh`, `package.json` raíz, `.github/workflows/ci.yml` (paso en `unit`).

- [ ] **T-40** **(humana)** Provisionar el Droplet de staging y `docs/operations/despliegue.md` — CA: CA-30, CA-32, CA-26 (sección) — Depende: T-38 — ~4 h
  Droplet 2 vCPU/4 GB Ubuntu LTS + Docker; usuario `deploy` (grupo `docker`, solo clave SSH, sin sudo); swap 2 GB;
  `/opt/nimbo` con `compose.yml`, `compose.staging.yml`, `infra/`, `.env` (`COMPOSE_FILE=compose.yml:compose.staging.yml`,
  hosts `*.staging.nimbo.me`, `ACME_CA_SERVER` de staging de LE primero); DNS A de `staging`, `api.staging`,
  `docs.staging`, `s3.staging` → IP (alternativa `sslip.io`); firewall `ufw` solo 22/80/443; secretos `SSH_HOST`,
  `SSH_USER`, `SSH_KEY` en el ambiente `staging` de GitHub. Escribir `despliegue.md` (todo lo anterior + protección
  de `main` de T-33 + límites de memoria en demos con ONLYOFFICE + cambio a LE producción cuando Traefik esté
  estable + registro mensual de crédito).
  Archivos: `docs/operations/despliegue.md`.

- [ ] **T-41** `.github/workflows/deploy-staging.yml` — CA: CA-30 — Depende: T-37, T-39, T-40 — ~3 h
  `on: workflow_run` de «build-publish» (`conclusion == success`, rama `main`); `environment: staging`; copia
  `infra/deploy/*.sh` y `compose*.yml` al servidor (`scp`) y ejecuta `deploy.sh sha-<short>` por SSH; paso
  `if: failure()` ejecuta `rollback.sh`; paso final `curl -fsS https://api.staging.nimbo.me/api/v1/health/ready` y
  `curl -fsS https://staging.nimbo.me` (contiene «Nimbo»). Ensayo de CA-30 con migración que falla (rama de prueba
  con `down`/`up` que lanza): el job se detiene antes de `up -d` y los contenedores anteriores siguen sirviendo;
  evidencia en `verification.md`.
  Archivos: `.github/workflows/deploy-staging.yml`, `specs/000-fundaciones/verification.md`.

- [ ] **T-42** **(humana)** `docs/operations/rollback.md` y ensayo de rollback — CA: CA-31 — Depende: T-41 — ~2 h
  Procedimiento paso a paso (`ssh deploy@…`, `cat .previous-tag`, `./infra/deploy/rollback.sh`, verificación con
  `curl -I …/api/v1/health/live` → `x-nimbo-version: sha-N-1`), cuándo sí ejecutar `migration:revert` (solo si la
  spec de la migración lo indica), tiempo objetivo < 10 min. Ensayo único cronometrado con dos SHAs reales; comandos
  y tiempo en `verification.md`. Enlazar desde `README.md` (sección «Operación») como base del Manual Técnico.
  Archivos: `docs/operations/rollback.md`, `README.md`, `specs/000-fundaciones/verification.md`.

- [ ] **T-43** **(humana)** Verificación de red, cabeceras y misma imagen — CA: CA-32, CA-29, CA-3 — Depende: T-41 — ~1 h
  `nmap -p 80,443,5432,6379,9000,9001 <ip>` (solo 80→443 y 443 abiertos), `curl -I https://staging.nimbo.me` y
  `https://api.staging.nimbo.me/api/v1/health/live` (HSTS, `nosniff`, `X-Frame-Options`, `Referrer-Policy`,
  certificado válido de LE producción), `curl -sS https://s3.staging.nimbo.me` → 404 de Traefik; la imagen
  `sha-<x>` corriendo en staging es la misma que se ejecuta en local con `.env` local (mismo digest). Evidencia en
  `verification.md`.
  Archivos: `specs/000-fundaciones/verification.md`.

- [ ] **T-44** Documentación final y cierre — CA: todos (trazabilidad) — Depende: T-42, T-43 — ~2 h
  `docs/sdd/product-context.md` §8 y `docs/adr/README.md` ya los actualizó `architect`; verificar que sigan
  coherentes. Actualizar `CLAUDE.md` (tabla «Estado del proyecto» si cambia; comandos ya hechos en T-10), `README.md`
  (sección «Operación» con enlaces a `docs/operations/*`), `specs/README.md` (000 → `En verificación`), y dejar en
  «Notas del developer» de este archivo la decisión tomada en R-3 y cualquier desviación registrada en spec §15.
  Recordatorio para `architect` al cierre de Fase 1: redibujar el PDF de clases M8 (sin salud) + bloque T1 (DF-49).
  Archivos: `CLAUDE.md`, `README.md`, `specs/README.md`, `specs/000-fundaciones/tasks.md`.

## Matriz CA → tareas

| CA | Tareas | CA | Tareas |
|---|---|---|---|
| CA-1 | T-08, T-09, T-10, T-16, T-22, T-26 | CA-18 | T-07, T-13, T-16, T-22, T-25 |
| CA-2 | T-09, T-31 | CA-19 | T-08, T-13, T-23, T-31 |
| CA-3 | T-09, T-25, T-38, T-43 | CA-20 | T-04, T-20 |
| CA-4 | T-01, T-05, T-06, T-10 | CA-21 | T-03, T-19, T-20 |
| CA-5 | T-05, T-27, T-28, T-29 | CA-22 | T-03, T-19, T-20 |
| CA-6 | T-27, T-28 | CA-23 | T-06, T-22, T-35 |
| CA-7 | T-27, T-29 | CA-24 | T-17, T-24, T-31, T-33 |
| CA-8 | T-29 | CA-25 | T-24, T-34 |
| CA-9 | T-02, T-04, T-26, T-31 | CA-26 | T-33, T-40 |
| CA-10 | T-15 | CA-27 | T-31, T-32, T-34 |
| CA-11 | T-15, T-31 | CA-28 | T-35, T-36, T-37 |
| CA-12 | T-15, T-34 | CA-29 | T-07, T-25, T-36, T-37, T-43 |
| CA-13 | T-12, T-14, T-16, T-17 | CA-30 | T-38, T-39, T-40, T-41 |
| CA-14 | T-21, T-22 | CA-31 | T-14, T-35, T-39, T-42 |
| CA-15 | T-12 | CA-32 | T-38, T-40, T-43 |
| CA-16 | T-03, T-18 | CA-33 | T-03, T-07 |
| CA-17 | T-11 | — | — |

Los 33 criterios tienen al menos una tarea. Tareas humanas no automatizables: T-27, T-32, T-33, T-34, T-40, T-42, T-43.

## Resumen de esfuerzo

| Bloque | Tareas | Horas aprox. | PR |
|---|---|---|---|
| 1 esqueleto | T-01…T-10 | 25 | PR-1 |
| 2 shared | T-11…T-26 | 41 | PR-2 |
| 3 compuerta | T-27 | 1 (reunión) | — |
| 4 CI | T-28…T-34 | 15 | PR-3 |
| 5 imágenes | T-35…T-37 | 9 | PR-4 |
| 6 staging | T-38…T-44 | 19 | PR-5 |

Total ≈ 110 h de una persona en dos semanas: es ajustado. El plan §9 R-1 lo asume; si el bloque 2 se retrasa, T-23,
T-24 y T-25 pueden pasar al PR-3, y T-42/T-43 pueden hacerse en la primera semana de Fase 2 sin bloquear a nadie
(RNF-20 exige el ensayo de rollback una vez en esta spec, no en una fecha concreta).

## Notas del developer

- **T-01** (2026-09-16): se agregó `.gitattributes` con `* text=auto eol=lf` (no estaba en la lista de archivos): el
  equipo mezcla Windows y otros SO y el commit inicial mostró avisos CRLF. Precisión, no desviación.
- **T-01**: el script raíz `test` es `jest --config jest.config.cjs && pnpm -r run test` (el plan §6.1 dice
  `pnpm -r run test`): `pnpm -r` no incluye el paquete raíz, y sin el primer tramo la prueba de CA-4
  (`scripts/repo-structure.spec.ts`) nunca correría. `env:check` apunta al marcador hasta que T-23 cree
  `scripts/check-env-example.ts` (evita un script roto en `main` tras el PR-1).
- **T-01**: la máquina de desarrollo tenía Node 24 por defecto; con `engine-strict=true` pnpm rechaza todo. Se
  instaló Node 22 con nvm-windows (`nvm install 22`) y se usó por `PATH` sin cambiar la versión global. Es exactamente
  lo que `.nvmrc` pide; el README (T-10) lo documenta.
- **T-02**: `eslint/next.js` usa `@next/eslint-plugin-next` (reglas `recommended` + `core-web-vitals`) y
  `eslint-plugin-react-hooks` directamente en flat config, en lugar del paquete `eslint-config-next`, que en 15.x sigue
  en formato *eslintrc* y exigiría `@eslint/eslintrc` (FlatCompat) más `eslint-plugin-import` v2 duplicando
  `import-x`. Mismas reglas, sin puente de compatibilidad. `eslint-import-resolver-typescript` (ya previsto en el plan
  §6.4 para T-28) se instala desde ahora porque `import-x` lo necesita para resolver `.ts`.
- **T-03**: `@nimbo/contracts` expone `types` → `src/index.ts` (typecheck sin compilar) y `default` → `dist/index.js`
  (runtime). El script `prepare` compila `dist/` en cada `pnpm install`, así CA-1 no exige un paso manual de build.
- **T-04**: las configuraciones de Jest de `api` son `jest.int.config.cjs` / `jest.isolation.config.cjs` (no `.ts`):
  Jest 29 carga configs `.ts` solo con `ts-node`, una dependencia extra que nada más necesita. T-17/T-24 las rellenan.
- **T-06 · Decisión R-3: alternativa aprobada (`worker.main.ts` en `apps/api` + `apps/worker` delgado).** Se probó
  primero la ruta canónica (`paths` `@nimbo/api/*` → `../api/src/*`, `references: [../api]`, `api` `composite`,
  `tsc -b && tsc-alias`) y falló en dos puntos sin remedio limpio: (1) `tsc --noEmit -p tsconfig.json` del worker
  exige que `apps/api/dist/**/*.d.ts` exista (TS6305), así que `pnpm typecheck` dependería de un build previo;
  (2) `tsc-alias` no reescribe rutas que apuntan fuera de `rootDir`, el `require("@nimbo/api/shared")` queda intacto y
  `node dist/main.js` falla con «Cannot find module». Las variantes que lo arreglan (`rootDir: ..` compilando `api`
  dos veces, `paths` a `../api/dist/*`, hoisting de dependencias) son trucos y además obligan a duplicar en
  `apps/worker/package.json` cada dependencia de runtime de `api`. Resultado: `apps/api/src/worker.main.ts` y
  `apps/api/src/worker.module.ts` (raíces de composición; T-28 las agrega al elemento `composition` del lint junto a
  `main.ts`/`app.module.ts`); `nest build` emite `dist/main.js` y `dist/worker.main.js` de una vez; `apps/worker`
  conserva `package.json` (`dependencies: { api: workspace:* }`), `src/healthcheck.ts` (compilado a
  `dist/healthcheck.js`) y, en T-35, su `Dockerfile` con `CMD node apps/api/dist/worker.main.js`. Desarrollo:
  `pnpm --filter worker dev` delega en `api` `dev:worker` = `nest start --watch --path tsconfig.worker.json
  --entryFile worker.main` (salida en `apps/api/dist-worker/` para no pisar el watcher de `api`). No se usa `tsx`
  para Nest: esbuild no emite `design:paramtypes`, y la inyección por tipo dejaría de funcionar. Sin alias, el
  lint de T-28 no necesita `eslint-import-resolver-typescript` para el worker (sigue instalado para resolver `.ts`).
  Verificado: `pnpm --filter api build && node dist/worker.main.js` → `GET /health/live` `200`;
  `node apps/worker/dist/healthcheck.js` sale `0` con el proceso arriba y `1` sin él. Registrado también en plan §9 R-3.
- **T-07**: `page.spec.tsx` renderiza el Server Component con `react-dom/server` (`renderToStaticMarkup(await
  StatusPage())`) en entorno `node`, sin `jsdom` ni Testing Library: menos dependencias y prueba exactamente lo que
  el servidor emite. Jest de `web` usa `next/jest` (SWC) porque el tsconfig de Next (`module: ESNext`, `jsx:
  preserve`) no encaja con ts-jest. `HealthReadyResponse` pasa a `z.infer` del esquema (equivalente a
  `Partial<Record<…>>`): con `exactOptionalPropertyTypes` una interfaz aparte no era asignable desde `.partial()`.
  `next-env.d.ts` es generado y va en `.gitignore` (recomendación de Next 15). `next build` compila y genera las
  páginas, pero el paso final de `output: 'standalone'` falla en Windows sin privilegio de symlink (EPERM al copiar
  `node_modules` de pnpm); en Linux/Docker no ocurre y T-36 lo verifica. `next dev` sin `API_INTERNAL_URL` escribe
  la línea `config.invalid` y se detiene (CA-18).
- **T-09**: Traefik no puede enrutar hacia procesos del host solo con etiquetas Docker, así que las rutas `/` →
  `host.docker.internal:3002` y `/api` → `host.docker.internal:3000` viven en un archivo de proveedor `file`,
  `infra/traefik/local-routes.yml` (montado solo por el override), con prioridad baja para que los enrutadores por
  etiquetas del perfil `apps` ganen si se activa. `/docs` (ONLYOFFICE) y `/s3` (MinIO) van por etiquetas. Verificado
  con `docker compose config --services`: sin perfil = `minio minio-init postgres redis traefik mailpit`; con
  `--profile onlyoffice` aparece `onlyoffice`; `WORKER_PORT` no figura en ningún `ports:`. **Pendiente**: `docker
  compose up -d` y `http://localhost/docs/healthcheck` → `true` no se pudieron ejecutar porque Docker Desktop no
  estaba corriendo en la máquina; queda para `verification.md` (CA-1/CA-2) al cerrar el PR-1.
- **T-10**: `README.md` y `CLAUDE.md` actualizados. El cronometraje de CA-1 en máquina limpia **no se hizo** (Docker
  apagado y `migration:run` llega en T-15); `verification.md` lo crea `tester` con la plantilla y registra el tiempo
  al cerrar PR-1/PR-2 (T-26 lo repite). Solo se han creado dos paquetes menores no listados en el plan §6:
  `eslint-plugin-react-hooks` (reglas de hooks que `next/core-web-vitals` traía) y `eslint-import-resolver-typescript`
  (ya previsto en ADR-0008/plan §6.4). Sin dependencias significativas fuera de ADR-0015.
