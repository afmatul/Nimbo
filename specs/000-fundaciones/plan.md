# Plan 000 — Fundaciones: monorepo, contenedores, CI/CD, ambientes, `shared`, salud y fronteras

> Spec: `./spec.md` · Estado del plan: **Aprobado** (architect, segunda revisión 2026-09-15; ver §11.0). Cambios 1–10 de §11.3 incorporados (planner; ver §12)

## 1. Resumen técnico

Se crea el monorepo pnpm con tres aplicaciones (`apps/api`, `apps/web`, `apps/worker`) y dos paquetes
(`packages/contracts`, `packages/config`), gobernado por un `tsconfig` base estricto, ESLint *flat config* con lint de
fronteras y Prettier. El módulo transversal `shared` de `api` aporta las piezas que todos los módulos posteriores
reutilizan: `Actor`, `IClock` (`SystemClock`/`FixedClock`), `DomainError` con estado HTTP por clase y un único
`DomainExceptionFilter`, logger Pino (`nestjs-pino`) con una lista única de redacción profunda, `correlationId` por
`AsyncLocalStorage` propagado a HTTP y a BullMQ, validación de entorno con zod (`loadEnv` puro; `main.ts` aborta antes
de abrir puertos), y un `HealthModule` (salud en `shared`, DF-49) con `HealthService` + `IHealthIndicator` en
`shared/application/health/` e indicadores Postgres, Redis y MinIO en `shared/infrastructure/health/`. `worker` es una
aplicación NestJS que compone los módulos de `api` por alias `@nimbo/api/*` (sujeto al mismo lint de fronteras) y
expone un puerto interno de salud sin prefijo `/api/v1`. TypeORM usa `synchronize: false` como literal y la migración
inicial crea la extensión `vector` con `down`. Docker: imágenes multietapa sin root, `compose.yml` base en la raíz con
`compose.override.yml` (local: puertos, Mailpit, ONLYOFFICE bajo perfil) y `compose.staging.yml` (Traefik con Let's
Encrypt en `nimbo.me`, puertos cerrados, cabeceras de seguridad, enrutador `s3.staging` deshabilitado hasta 005).
GitHub Actions: `ci.yml` con los seis jobs de D-2, `build-publish.yml` a `ghcr.io/afmatul/*` y `deploy-staging.yml`
por SSH con `deploy.sh` transaccional (migra con la imagen nueva **antes** de cambiar `IMAGE_TAG`, `trap` de
restauración); rollback documentado en `docs/operations/rollback.md`.

Precisión editorial sobre la spec: todos los endpoints de salud viven bajo el prefijo global `/api/v1` (CA-1, CA-20 a
CA-22). Las menciones a `https://api.staging.<dominio>/health/ready` en §2 y CA-30 se leen como
`https://api.staging.nimbo.me/api/v1/health/ready`; se registra en el cambio de la spec (§15) para que `verification.md`
use una sola ruta.

## 2. Verificación contra la constitución

| Artículo | Cumple | Nota |
|---|---|---|
| I Spec manda | ☑ | Cada sección de este plan cita el CA que resuelve; nada fuera de §6 de la spec. |
| IV SOLID | ☑ | `HealthService` (orquesta) vs. indicadores (una dependencia cada uno, O/L); `CorrelationIdMiddleware`, `VersionHeaderMiddleware` y `DomainExceptionFilter` con una sola razón de cambio; `IHealthIndicator` e `IClock` segregados. |
| V YAGNI — abstracciones nuevas | ☑ | Puertos nuevos: ninguno fuera de los diagramas. `IClock` (regla a: reloj) e `IHealthIndicator` (regla a + e: Postgres/Redis/MinIO son tres implementaciones reales) ya están en `architecture.md` §5. No se crea `IQueue`, `ILogger` ni `IConfig`: se usan BullMQ, Pino y zod directamente desde `shared/infrastructure`. Ver §6. |
| VI DRY | ☑ | Lista única `REDACTED_FIELDS`; un solo `DomainExceptionFilter`; esquema de entorno único por app; `packages/contracts` es la única fuente del contrato de salud y de error; `packages/config` es la única fuente de tsconfig/eslint/jest. Un solo runner de migraciones (`scripts/migrate.ts`) usado en local, CI y deploy. |
| VIII Fronteras | ☑ | `shared` no depende de ningún módulo. El lint de fronteras (§6.4) codifica el DAG de `architecture.md` §3 y se prueba con fixtures negativos (CA-5 a CA-8). |
| IX Seguridad — `actor`/`accessibleNodes` | ☑ (n/a) | No hay datos de cliente. Se define `Actor` para que 002/003 lo usen; ningún servicio de esta spec recibe datos de usuario. Endpoints de salud públicos sin topología (CA-22). |
| X Operabilidad | ☑ | `correlationId` en HTTP y en trabajos (CA-13, CA-14); eventos de bitácora en §7; `/health/live` y `/health/ready` en api y worker. Métricas Prometheus: spec 022. |
| XI Integridad | ☑ (n/a) | Sin escrituras de negocio. El procesador `ping` es idempotente por construcción (solo registra bitácora). Migración inicial reversible. |
| XII Degradación | ☑ | `ready` responde `503` con detalle agregado sin caer; `live` nunca consulta dependencias. |

## 3. Coherencia con los diagramas

| Diagrama | Clases / tablas usadas | ¿Se aparta del diagrama? | Acción |
|---|---|---|---|
| Clases T1 `shared` (DF-49, `design-model.md` §3 «T1») | `HealthController` (live, ready), `HealthService`, `IHealthIndicator` → `PostgresHealthIndicator`, `RedisHealthIndicator`, `MinioHealthIndicator` (DF-29 parcial) | no: la salud ya está en T1 según `design-model.md` y `architecture.md` §3/§5 (DF-49 `Aceptado`). `OnlyOfficeHealthIndicator` lo aporta `editing` (016) y se registra en `HealthModule.forRoot({ indicators })` desde la raíz de composición. | Redibujar el PDF de clases M8 (quitar salud) + bloque T1 al cierre de Fase 1 (`architect`) |
| Clases (transversal) | `Actor` (id, role, canReadContent), `Role` enum, `IClock` → `SystemClock`/`FixedClock`, `DomainError` ← `InvalidInputError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`; `DomainExceptionFilter`, `CorrelationIdMiddleware`, `VersionHeaderMiddleware` | no | ninguna; nombres exactos de `design-model.md` §3 T1 |
| E-R | Ninguna tabla de negocio. Tabla de control `migracion` (TypeORM `migrationsTableName`) | no (confirmado en ADR-0002) | ninguna |
| Arquitectura §2 | `apps/api`, `apps/web`, `apps/worker`, `packages/contracts`, `packages/config`, `infra/`, `e2e/`, `load/`; `compose*.yml` en la raíz e `infra/` solo configuraciones | no (§2 ya actualizado por `architect`) | ninguna |
| Arquitectura §1 | Separación `api`/`worker` por proceso e imagen, no por carpeta (ADR-0001) | no | Habilita la alternativa R-3 sin cambiar el diagrama |
| Arquitectura §3 | DAG de módulos codificado en `packages/config/eslint/boundaries.js` (lista de ADR-0010) | no | Depende de ADR-0008 (Propuesto) y ADR-0010 (por redactar); ver §9 D-1 |
| Arquitectura §8 | Cola `ping` (prueba, en `shared`) | Sí: no está en la tabla de colas | Es una cola de verificación (CA-14), no de negocio; no se agrega a §8 |

Hallazgos `DF-xx` que esta spec resuelve o de los que depende:

- **DF-49** (`Aceptado`): salud en `shared`. Este plan lo aplica tal cual.
- **DF-02, DF-03, DF-30, DF-34** (dependencia): el lint de fronteras conoce exactamente los 12 módulos resultantes
  (`shared`, `audit`, `notifications`, `realtime`, `identity`, `billing`, `access`, `storage`, `sharing`, `editing`,
  `intelligence`, `optimizer`, `backoffice`) y su DAG. Si ADR-0010 cambia la lista, se edita un solo archivo
  (`boundaries.js`). **Compuerta** (cambio 10 de §11.3): el equipo marca estos cuatro DF `Aceptado` al aceptar
  ADR-0010, y eso ocurre **antes del PR-3 «CI»**, que fija `boundaries.js`; hasta entonces se usa la lista de
  `architecture.md` §3 tal cual.
- **DF-06, DF-23, DF-24** (convenciones de tipos): 000 no crea columnas, pero deja la guía ejecutable: regla ESLint
  `no-restricted-syntax` en `packages/config/eslint/typeorm-columns.js` que falla ante `@Column({ type: 'int' })` o
  `'integer'` cuando el nombre de la propiedad termina en `Bytes`, y ante `type: 'numeric'|'decimal'|'float'` cuando
  termina en `Cents`/`Centavos`. Es una regla de lint sencilla (sin plugin propio); la aplican 005/006a. **Compuerta**
  (cambio 10): el equipo marca DF-06, DF-23 y DF-24 `Aceptado` antes del PR-3, que introduce `typeorm-columns.js`.
- **DF-29** (parcial): se agrega `RedisHealthIndicator`; ONLYOFFICE y `/metrics` quedan para 016/022.
- **DF-28** (informativo): el compose refleja la arquitectura corregida (worker separado, Traefik delante de MinIO y
  ONLYOFFICE).

## 3b. Módulos afectados

| Módulo | Cambio | Capa(s) |
|---|---|---|
| `shared` (nuevo) | `Actor`, `Role`, `IClock`, `SystemClock`, `FixedClock`, `DomainError` y subclases base, `DomainExceptionFilter`, logger Pino + redacción, `CorrelationIdMiddleware`, `CorrelationContext`, `VersionHeaderMiddleware`, `env.schema`/`loadEnv`, `HealthService` + `IHealthIndicator` (application), 3 indicadores (infrastructure), `HealthModule.forRoot`, cola `ping` (`PingQueue`, `PingProcessor`), `buildDataSourceOptions` | domain, application, infrastructure, presentation |
| `apps/worker` (nuevo) | `WorkerModule` (raíz de composición: `SharedModule`, `HealthModule.forRoot({ indicators: [RedisHealthIndicator] })`, `PingProcessor`), `main.ts`, `healthcheck.ts` | composición |
| `apps/web` (nuevo) | `app/page.tsx` página de estado, `lib/api-base-url.ts`, `env.ts` | presentación |
| `packages/contracts` (nuevo) | `health.ts`, `error.ts`, `index.ts` | contratos |
| `packages/config` (nuevo) | `tsconfig.base.json`, `eslint/`, `jest/`, `prettier.config.js` | tooling |

Dependencias nuevas entre módulos: **ninguna**. `shared` no importa de nadie; nadie más existe todavía.

## 4. Modelo de datos

Sin tablas de negocio. Solo la extensión y la tabla de control de migraciones.

```sql
-- apps/api/src/migrations/20260915120000-crear-extension-vector.ts
-- up
CREATE EXTENSION IF NOT EXISTS vector;
-- down
DROP EXTENSION IF EXISTS vector;
```

- Índices: ninguno.
- RLS: ninguna (no hay tablas de cliente). Se activa por tabla en 003/005.
- Migración reversible: `down` ejecuta `DROP EXTENSION IF EXISTS vector`. Funciona mientras ninguna columna use el
  tipo; cuando 019 cree `fragmento.embedding vector(768)`, su propio `down` elimina la columna antes, y el orden de
  reversión de TypeORM (LIFO) garantiza que esta migración se revierte al final.
- `migrationsTableName: 'migracion'` (español singular, `conventions.md` §BD). CA-11 cuenta filas en `migracion`.
- La imagen `pgvector/pgvector:pg17` crea al usuario `POSTGRES_USER` como superusuario, por lo que `CREATE EXTENSION`
  funciona en local, CI y staging sin script `initdb` adicional.

Fuente de datos, **función pura sin efectos al importar** (`apps/api/src/shared/infrastructure/persistence/data-source.ts`,
exportada por `shared/index.ts`):

```ts
export function buildDataSourceOptions(env: Pick<Env, 'DATABASE_URL'>): DataSourceOptions {
  return {
    type: 'postgres',
    url: env.DATABASE_URL,
    synchronize: false,          // literal; CA-10 lo verifica sin variables de entorno
    migrationsTableName: 'migracion',
    migrations: [join(__dirname, '../../../migrations/*.{ts,js}')],
    entities: [join(__dirname, '../../../modules/**/infrastructure/persistence/*.orm-entity.{ts,js}')],
    logging: false,
  };
}
```

`AppDataSource` vive **fuera** de `shared` y **no** se reexporta: `apps/api/src/migrations/data-source.cli.ts`
(`export const AppDataSource = new DataSource(buildDataSourceOptions(requireEnv()))`, donde `requireEnv()` llama a
`loadEnv()` y lanza si `ok === false`). Lo usan solo la CLI de TypeORM (`-d src/migrations/data-source.cli.ts`) y
`src/scripts/migrate.ts`. Así, importar `shared` en una prueba unitaria nunca lee el entorno ni termina el proceso.
En Nest, `SharedModule` registra `TypeOrmModule.forRootAsync` con `buildDataSourceOptions(env)` + `autoLoadEntities: true`,
`retryAttempts: 10`, `retryDelay: 3000`; el glob de `entities` solo lo usa la CLI (raíz de composición; ningún código
de `shared` importa entidades ORM de otros módulos).

`worker` reutiliza `buildDataSourceOptions` vía `@nimbo/api/shared` (una sola fuente; CA-10 cubre ambos procesos
porque es la misma función).

Scripts de `apps/api/package.json`:

| Script | Comando | Nota |
|---|---|---|
| `migration:generate` | `node scripts/migration-generate.mjs` | Calcula `YYYYMMDDHHmmss`, ejecuta `typeorm-ts-node-commonjs migration:generate -d src/migrations/data-source.cli.ts -t <ts> src/migrations/<nombre>`; el nombre llega por `pnpm --filter api migration:generate -- crear-archivo` |
| `migration:run` | `tsx src/scripts/migrate.ts run` | Mismo archivo que la imagen ejecuta como `node dist/scripts/migrate.js run` |
| `migration:revert` | `tsx src/scripts/migrate.ts revert` | Idem |

`src/scripts/migrate.ts` inicializa `AppDataSource`, ejecuta `runMigrations({ transaction: 'each' })` o
`undoLastMigration()`, imprime `{ event: 'migration.run', applied: [...] }` y sale con `1` si falla.

## 5. Contratos

### HTTP

Prefijo global `/api/v1` (`app.setGlobalPrefix('api/v1')`). Sin autenticación en esta spec. Todas las respuestas
llevan `x-correlation-id` (CA-13) y `x-nimbo-version` (valor de `APP_VERSION`, p. ej. `sha-abc1234`; CA-31).

| Método | Ruta | Rol | Request | Respuesta | Errores |
|---|---|---|---|---|---|
| GET | `/api/v1/health/live` | público | — | `200` `{ "status": "ok" }` (`HealthLiveResponse`) | — |
| GET | `/api/v1/health/ready` | público | — | `200` `{ "status": "ok", "checks": { "postgres": "up", "redis": "up", "minio": "up" } }` · `503` `{ "status": "error", "checks": { … "redis": "down" … } }` (`HealthReadyResponse`; `api` reporta los tres) | Nunca `ErrorResponse`: `503` usa el mismo cuerpo con `status: "error"` |
| GET | `/health/live`, `/health/ready` (**solo `worker`, puerto interno `WORKER_PORT`, nunca en `ports:` de ningún compose, sin prefijo `/api/v1` porque no es API pública**) | red interna | — | `200 { "status": "ok" }` · `ready`: `200/503` `HealthReadyResponse` con `checks: { "redis": "up"|"down" }` (solo `redis`) | — |

Contrato único (`packages/contracts/src/health.ts`): `HealthReadyResponse = { status: 'ok' | 'error'; checks: Partial<Record<HealthCheckName, HealthCheckStatus>> }`.
`checks` es parcial por diseño: `api` incluye `postgres`, `redis`, `minio`; `worker` solo `redis`. Una sola definición
para ambos procesos (DRY); el esquema zod correspondiente usa `.partial()`.

Formato de error (todas las rutas presentes y futuras, `ErrorResponse` en `packages/contracts/src/error.ts`):

```json
{ "code": "SHARED_EXAMPLE_NOT_FOUND", "message": "No existe el recurso solicitado. Verifica el identificador.", "correlationId": "2f0c…" }
```

| Clase base (`shared/domain/errors/`) | HTTP | Uso previsto |
|---|---|---|
| `DomainError` (abstracta: `code`, `message`) | — | nunca se lanza directamente |
| `InvalidInputError` | 422 | reglas de dominio sobre entrada (cuota, formato) |
| `UnauthorizedError` | 401 | 002 |
| `ForbiddenError` | 403 | 003, sharing |
| `NotFoundError` | 404 | todos |
| `ConflictError` | 409 | cargas duplicadas, sesiones, pagos |
| (no `DomainError`: `HttpException` de Nest, p. ej. `ValidationPipe`) | el suyo | el filtro normaliza el cuerpo a `ErrorResponse` con `code = 'VALIDATION_FAILED'` (400) u `'HTTP_<STATUS>'` |
| (error no controlado) | 500 | `code = 'INTERNAL_ERROR'`, mensaje genérico; detalle solo en bitácora `http.unhandled_error` |

Cabecera `x-correlation-id`: entrante opcional; válida si `^[\x21-\x7E]{1,128}$` (imprimibles ASCII sin espacios,
≤ 128). Inválida o ausente → UUID v4 nuevo (`crypto.randomUUID()`); nunca se responde error por ella.

### Eventos

| Evento | Productor | Consumidores | Payload |
|---|---|---|---|
| Cola BullMQ `ping` (`shared`) | `PingQueue.enqueue()` (api; solo la prueba de integración de CA-14 la invoca, importándola por ruta interna del propio módulo) | `PingProcessor` (worker) | `{ correlationId: string, sentAt: string }`. Todo `job.data` de cualquier cola futura lleva `correlationId` (regla en `enqueueWithCorrelation()`) |

No hay eventos de dominio en esta spec.

### Tiempo real

Ninguno.

## 6. Diseño de componentes

### 6.1 Estructura del monorepo

```
nimbo/
├─ package.json                 # scripts raíz (abajo), packageManager: pnpm@10.x, engines node 22
├─ pnpm-workspace.yaml          # packages: apps/*, packages/*   (docs/design/mockups queda fuera)
├─ .nvmrc                       # 22
├─ .npmrc                       # engine-strict=true, auto-install-peers=true
├─ .env.example
├─ .gitignore  .dockerignore  .editorconfig  .prettierignore
├─ eslint.config.mjs            # flat config raíz: importa packages/config/eslint/*
├─ prettier.config.mjs          # importa packages/config/prettier.config.js
├─ tsconfig.json                # solo references a apps/* y packages/*
├─ compose.yml  compose.override.yml  compose.staging.yml
├─ README.md                    # arranque desde cero (CA-1)
├─ .github/
│  ├─ workflows/ci.yml  build-publish.yml  deploy-staging.yml
│  └─ pull_request_template.md
├─ apps/api  apps/web  apps/worker
├─ packages/contracts  packages/config
├─ infra/traefik/{traefik.local.yml, traefik.staging.yml, dynamic/headers.yml}
├─ infra/minio/init.sh          # crea bucket `nimbo` con versionado (D-7)
├─ e2e/README.md  load/README.md   # marcadores
└─ docs/operations/{despliegue.md, rollback.md, ambientes.md}
```

Scripts raíz exactos (CLAUDE.md «Comandos del repositorio»):

| Script | Comando |
|---|---|
| `dev` | `pnpm -r --parallel --filter "./apps/*" run dev` |
| `lint` | `eslint . --max-warnings 0 && prettier --check .` |
| `typecheck` | `pnpm -r --filter "./apps/*" --filter "./packages/*" run typecheck` (`tsc --noEmit -p tsconfig.json` en cada uno) |
| `test` | `pnpm -r run test` (Jest unitario; `apps/web` con `--passWithNoTests`) |
| `test:int` | `pnpm --filter api run test:int` (`jest -c jest.int.config.ts`) |
| `test:isolation` | `pnpm --filter api run test:isolation` (`jest -c jest.isolation.config.ts`) |
| `test:e2e` | `node scripts/placeholder.mjs "sin pruebas E2E aún (000b/023)"` → salida `0` |
| `seed` | `node scripts/placeholder.mjs "seed pendiente (005/019)"` → salida `0` |
| `env:check` | `tsx scripts/check-env-example.ts` (CA-19) |

Paquetes: `api` (`@nimbo/api`), `web` (`@nimbo/web`), `worker` (`@nimbo/worker`), `@nimbo/contracts`, `@nimbo/config`.
`pnpm --filter api` funciona por nombre de carpeta y `--filter @nimbo/api` por nombre de paquete. Para que
`pnpm --filter api migration:run` (CLAUDE.md) funcione literalmente, el paquete se llama **`api`** y `worker`, `web`
(nombres cortos); `contracts`/`config` sí llevan prefijo `@nimbo/`.

`packages/config`:

```
packages/config/
├─ tsconfig.base.json        # strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, target ES2022, module NodeNext (api/worker) / bundler (web)
├─ tsconfig.nest.json  tsconfig.next.json  tsconfig.lib.json
├─ eslint/base.js            # @typescript-eslint strict-type-checked, import-x, unicorn (subset), prettier off
├─ eslint/nest.js            # reglas de capas + fronteras (boundaries.js)
├─ eslint/next.js            # next/core-web-vitals + prohibición de mockups
├─ eslint/boundaries.js      # lista de módulos y DAG (§6.4)
├─ eslint/typeorm-columns.js # DF-06/23/24
├─ jest/base.cjs             # ts-jest, coverageThreshold 60 % en application/ y domain/
└─ prettier.config.js
```

Versiones exactas (sin `^`) en cada `package.json` (D-1); `pnpm-lock.yaml` versionado; `engines.node = "22.x"`.

### 6.2 `apps/api/src/shared` (módulo transversal T1)

```
apps/api/src/
├─ main.ts                          # bootstrap HTTP: loadEnv → (si !ok: config.invalid + exit 1) → logger → app → prefix → filtro → listen
├─ app.module.ts                    # raíz de composición: SharedModule, HealthModule.forRoot({ indicators: [Postgres, Redis, Minio] }), PingQueue
├─ migrations/
│  ├─ data-source.cli.ts            # AppDataSource (solo CLI y migrate.ts; NO se reexporta)
│  └─ 20260915120000-crear-extension-vector.ts
├─ scripts/migrate.ts
├─ shared/
│  ├─ index.ts                      # ÚNICA API pública (abajo)
│  ├─ shared.module.ts              # SharedModule sin parámetros: config (loadEnv), logger, TypeOrmModule (autoLoadEntities), conexión BullMQ
│  ├─ health.module.ts              # HealthModule.forRoot({ indicators: Type<IHealthIndicator>[] }) → HealthService + HealthController
│  ├─ domain/
│  │  ├─ actor.ts                   # interface Actor { readonly id; readonly role: Role; readonly canReadContent }
│  │  ├─ role.enum.ts               # enum Role { CLIENT, ADMIN, SUPPORT, OPERATOR }
│  │  ├─ i-clock.port.ts            # interface IClock { now(): Date }; I_CLOCK token
│  │  ├─ fixed.clock.ts             # FixedClock (dominio puro; usable en pruebas de dominio)
│  │  └─ errors/
│  │     ├─ domain-error.ts         # abstract class DomainError extends Error { abstract readonly code; }
│  │     ├─ invalid-input.error.ts  unauthorized.error.ts  forbidden.error.ts  not-found.error.ts  conflict.error.ts
│  │     └─ index.ts
│  ├─ application/
│  │  └─ health/
│  │     ├─ i-health-indicator.port.ts   # interface IHealthIndicator { readonly name: HealthCheckName; check(): Promise<HealthCheckStatus> }; token I_HEALTH_INDICATORS
│  │     └─ health.service.ts            # HealthService.ready(): Promise.allSettled con timeout 1500 ms por indicador; agrega up/down
│  ├─ infrastructure/
│  │  ├─ clock/system.clock.ts      # SystemClock implements IClock (new Date())
│  │  ├─ config/
│  │  │  ├─ env.schema.ts           # zod: apiEnvSchema, workerEnvSchema; type Env
│  │  │  ├─ load-env.ts             # loadEnv(schema, source = process.env): { ok: true, env } | { ok: false, issues: string[] } — puro, sin process.exit
│  │  │  └─ env-report.ts           # formatea issues: «`DATABASE_URL` es obligatoria», sin valores
│  │  ├─ logging/
│  │  │  ├─ redacted-fields.ts      # export const REDACTED_FIELDS: ReadonlySet<string>
│  │  │  ├─ redact-deep.ts          # redactDeep(obj): recorre y reemplaza por '[REDACTED]' (ciclos y profundidad ≤ 16)
│  │  │  ├─ logger.options.ts       # pino/nestjs-pino: mixin (correlationId/jobId), hooks.logMethod → redactDeep, redact headers
│  │  │  └─ logger.module.ts        # re-export configurado de nestjs-pino LoggerModule.forRoot
│  │  ├─ correlation/
│  │  │  ├─ correlation-context.ts  # AsyncLocalStorage<{ correlationId; jobId? }>; run(), get(), isValidCorrelationId()
│  │  │  └─ correlation-id.middleware.ts  # CorrelationIdMiddleware (lee/valida cabecera, set header, run())
│  │  ├─ persistence/data-source.ts # buildDataSourceOptions (pura; AppDataSource NO vive aquí)
│  │  ├─ queue/
│  │  │  ├─ bull.config.ts          # conexión Redis compartida (ioredis, maxRetriesPerRequest: null)
│  │  │  ├─ enqueue-with-correlation.ts  # enqueueWithCorrelation(queue, name, data): agrega correlationId del contexto
│  │  │  ├─ ping.queue.ts           # PingQueue (api): enqueue()
│  │  │  └─ ping.processor.ts       # PingProcessor (worker): @Processor('ping'); run dentro de CorrelationContext.run(job.data.correlationId ?? uuid, jobId)
│  │  └─ health/
│  │     ├─ postgres.health-indicator.ts # PostgresHealthIndicator: SELECT 1 vía DataSource
│  │     ├─ redis.health-indicator.ts    # RedisHealthIndicator: PING vía ioredis
│  │     └─ minio.health-indicator.ts    # MinioHealthIndicator: HeadBucket(MINIO_BUCKET) vía @aws-sdk/client-s3
│  └─ presentation/
│     ├─ domain-exception.filter.ts # DomainExceptionFilter (@Catch()) → ErrorResponse
│     ├─ health.controller.ts       # HealthController: GET health/live, GET health/ready (delega en HealthService)
│     └─ version-header.middleware.ts  # (movido aquí desde infrastructure/http: es un middleware HTTP, capa de presentación)
```

`shared/index.ts` exporta exactamente: `Actor`, `Role`, `IClock`, `I_CLOCK`, `SystemClock`, `FixedClock`,
`DomainError`, `InvalidInputError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`,
`DomainExceptionFilter`, `CorrelationContext`, `CorrelationIdMiddleware`, `VersionHeaderMiddleware`,
`enqueueWithCorrelation`, `REDACTED_FIELDS`, `redactDeep`, `SharedModule`, `HealthModule`, `IHealthIndicator`,
`PostgresHealthIndicator`, `RedisHealthIndicator`, `MinioHealthIndicator`, `buildDataSourceOptions`, `Env`,
`SharedEnvBase`, `apiEnvSchema`, `workerEnvSchema`, `loadEnv`, `formatEnvIssues`, `ENV`, `EnvModule`, `MINIO_CONFIG`,
`MinioConfigModule`, `MinioConfig`, `PingProcessor` (refactor de T-16, §12 2026-09-19: las raíces de composición
necesitan `EnvModule.forRoot(env)` y `MinioConfigModule.forRoot(env)`).
**No** exporta `PingQueue` ni `HealthService` (ningún módulo los usa; la prueba de CA-14 importa `PingQueue` por ruta
interna, permitido para pruebas del propio módulo) ni `AppDataSource`. Nada de `infrastructure/**` se importa por ruta
interna desde otro módulo ni desde `apps/worker` (CA-5; lint de §6.4 sobre ambas apps).

Raíces de composición (sin `SharedModule.forRoot`; cada raíz compone lo que necesita):

| Raíz | Importa |
|---|---|
| `apps/api/src/app.module.ts` (`AppModule.forRoot(env)`) | `EnvModule.forRoot(env)`, `MinioConfigModule.forRoot(env)`, `SharedModule`, `HealthModule.forRoot({ indicators: [PostgresHealthIndicator, RedisHealthIndicator, MinioHealthIndicator] })`, `BullModule.registerQueue({ name: 'ping' })` + `PingQueue` |
| `apps/api/src/worker.module.ts` (`WorkerModule.forRoot(env)`) | `EnvModule.forRoot(env)`, `SharedModule`, `HealthModule.forRoot({ indicators: [RedisHealthIndicator] })`, `PingProcessor` |

Decisiones puntuales:

- **Validación de entorno: zod** (D-8). Justificación (Art. V y VI): no es una abstracción nueva sino una librería; el
  esquema se infiere a un tipo `Env` sin clases ni decoradores; `z.coerce.number().int().min(1).max(65535)` cubre
  `PORT=abc` (CA-18) con mensajes propios en español; `apps/web` (Next.js, sin DI de Nest) reutiliza la **misma**
  librería para su `env.ts`, y `conventions.md` §Frontend ya exige «esquema de `packages/contracts`» para
  `react-hook-form`, que en la práctica es zod. `class-validator` sigue siendo la herramienta de los DTOs HTTP
  (`ValidationPipe`); no se mezcla. Nueva dependencia significativa → se registra en un ADR menor junto a gitleaks
  (§10).
- **Esquema** (`env.schema.ts`): `NODE_ENV` ∈ {development, test, production}; `APP_ENV` ∈ {local, test, staging,
  production}; `APP_VERSION` (default `dev`); `PORT` (default 3000); `WORKER_PORT` (default 3001); `LOG_LEVEL`;
  `DATABASE_URL` (url); `REDIS_URL` (url); `MINIO_ENDPOINT` (url), `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` (secretos),
  `MINIO_BUCKET` (default `nimbo`), `MINIO_REGION` (default `us-east-1`). Sin `CORS_ORIGIN` (lo agrega 001 con el
  `ThrottlerModule`; en 000 el navegador no llama a la API). `web`: `APP_ENV`, `API_INTERNAL_URL` (server-side),
  `PORT` (default **3002**, para no chocar con `api` en 3000). Variables marcadas `secret: true` en un mapa
  `SECRET_KEYS` que `env-report.ts` nunca imprime (CA-18) y que también alimenta `REDACTED_FIELDS`.
- **Fallo de arranque** (CA-18): `loadEnv(schema)` es **pura** y devuelve `{ ok: true, env } | { ok: false, issues }`
  (probable sin simular `process.exit`). `main.ts` de `api` y de `worker` la llama **antes** de `NestFactory.create`;
  si `ok === false` escribe una línea JSON
  `{ "event": "config.invalid", "issues": ["`DATABASE_URL` es obligatoria", "`PORT` debe ser un entero entre 1 y 65535"] }`
  con `process.stderr.write` (el logger aún no existe) y llama `process.exit(1)`. `apps/web/src/env.ts` hace lo mismo
  en `instrumentation.ts` de Next.js (se ejecuta una vez al arrancar el servidor) para cumplir CA-18 en las tres apps.
- **Logger**: `nestjs-pino` con `pinoHttp.genReqId` = el `correlationId` ya fijado por `CorrelationIdMiddleware`
  (el middleware se registra primero vía `app.use`), `customProps: () => ({ correlationId })`, `mixin` desde
  `CorrelationContext` para que **cualquier** `this.logger.info(...)` fuera del ciclo HTTP (worker, cron) también lo
  lleve. Redacción: `hooks.logMethod` aplica `redactDeep` al objeto de fusión (cualquier nivel, CA-15) y `redact.paths`
  a `req.headers.authorization`, `req.headers.cookie`, `res.headers["set-cookie"]`. `REDACTED_FIELDS` = {password,
  passwordHash, token, accessToken, refreshToken, authorization, cookie, secret, apiKey, fileName, nombre, content,
  prompt} + claves de `SECRET_KEYS`. Comparación insensible a mayúsculas.
- **`correlationId` en BullMQ** (CA-14): `enqueueWithCorrelation(queue, name, data)` fusiona
  `{ ...data, correlationId: CorrelationContext.get()?.correlationId ?? randomUUID() }`. En el worker,
  `PingProcessor.process(job)` envuelve la lógica en `CorrelationContext.run({ correlationId: job.data.correlationId ?? randomUUID(), jobId: job.id }, …)`.
  Es una función y un patrón documentado, no una clase base (regla de tres: cuando existan tres procesadores, 019 o
  021 evalúan extraer `CorrelatedProcessor`).
- **Filtro** (CA-16): `@Catch()` global registrado en `main.ts` con `app.useGlobalFilters(new DomainExceptionFilter(logger))`.
  Mapea por `instanceof` en orden de las cinco subclases; los `HttpException` de Nest conservan su estado; todo lo demás
  → 500 `INTERNAL_ERROR` y bitácora `http.unhandled_error` con `err` (stack solo en servidor). El `message` de un
  `DomainError` es el que la subclase concreta define (en español, con acción correctiva); el filtro no lo altera.
- **Salud** (CA-20 a CA-22): se descarta `@nestjs/terminus` porque su cuerpo (`info/error/details`) no coincide con el
  contrato de la spec y sus indicadores devuelven mensajes de excepción en `error` (CA-22 lo prohíbe); mapearlo costaría
  más que el `HealthService` propio (~40 líneas). `HealthService.ready()` ejecuta los indicadores en paralelo con
  `timeout(1500 ms)` cada uno; cualquier rechazo o timeout → `down`; nunca serializa el error. `live` no inyecta nada.
  Capas (cambio 2 de §11.3): `IHealthIndicator` (puerto) y `HealthService` en `shared/application/health/`; los tres
  indicadores en `shared/infrastructure/health/`; `HealthController` en `shared/presentation/`; `health.module.ts` y
  `shared.module.ts` en la raíz de `shared/` (como `storage.module.ts` en `architecture.md` §4). Los indicadores
  implementan el puerto `IHealthIndicator` de T1 (DF-49, DF-29 parcial) y se registran con
  `HealthModule.forRoot({ indicators })` desde la raíz de composición: `api` los tres; `worker` solo
  `RedisHealthIndicator`; `editing` (016) aportará `OnlyOfficeHealthIndicator` sin tocar `shared`.
  Nota de arranque (cambio 9): con `TypeOrmModule` y `BullModule`, el proceso **no termina de arrancar** si Postgres o
  Redis no responden (`retryAttempts: 10`, `retryDelay: 3000`, luego falla); compose lo garantiza con
  `depends_on: condition: service_healthy` y `restart`. `live` solo demuestra que el proceso ya arrancado sigue vivo
  aunque las dependencias caigan después. Documentado en `docs/operations/ambientes.md`.
- **Salud del worker** (CA-23): `apps/worker` arranca con `NestFactory.create(WorkerModule)` y escucha en
  `WORKER_PORT` (3001) **sin publicar el puerto** (nunca en `ports:` de ningún compose); expone `/health/live` y
  `/health/ready` (solo Redis) **sin prefijo `/api/v1`** porque no es API pública.
  Razón para HTTP y no archivo de latido: 022 necesita `/metrics` por HTTP en el mismo proceso. `HEALTHCHECK` del
  Dockerfile: `node dist/healthcheck.js` (hace `fetch` a `http://127.0.0.1:${WORKER_PORT}/health/ready`, sale `1` si no
  es `200`), `--interval=20s --timeout=5s --retries=2 --start-period=30s` → no sano en < 60 s. `api` usa el mismo patrón
  con `/api/v1/health/live`.
- **`Actor`** (CA-17): interfaz con exactamente `id`, `role`, `canReadContent`. Sin fábrica ni guard (002/003).
- **`IClock`**: `interface IClock { now(): Date }`. `SystemClock` en infraestructura; `FixedClock` en `domain/` porque
  las pruebas de dominio de otros módulos deben poder usarlo sin importar infraestructura.

### 6.3 `apps/worker`

```
apps/worker/
├─ package.json          # name: worker; dependencies: api (workspace:*), @nestjs/*, bullmq
├─ tsconfig.json         # extends @nimbo/config/tsconfig.nest.json; paths { "@nimbo/api/*": ["../api/src/*"] }; references ../api
├─ src/main.ts           # loadEnv(workerEnvSchema) → (si !ok: config.invalid + exit 1) → NestFactory.create(WorkerModule) → listen(WORKER_PORT) → log worker.started
├─ src/worker.module.ts  # raíz de composición: SharedModule + HealthModule.forRoot({ indicators: [RedisHealthIndicator] }) + PingProcessor
└─ src/healthcheck.ts    # usado por HEALTHCHECK
```

`apps/worker/src` contiene **solo** esos tres archivos: el worker compone módulos de `api`, no aloja lógica propia
(§11.5). Importa únicamente `@nimbo/api/shared` y, en el futuro, `@nimbo/api/modules/<x>` (su `index.ts`); el lint
de §6.4 lo hace cumplir.

Resolución del alias: en desarrollo `tsx watch` (respeta `paths`); en Jest `moduleNameMapper`; en ESLint
`eslint-import-resolver-typescript`; en build `tsc -b && tsc-alias`. La imagen del worker copia `apps/api/dist` y
`apps/worker/dist`. Riesgo y alternativa en §9 (R-3).

### 6.4 Lint de fronteras (CA-5 a CA-8) — recomendación para ADR-0008

| Criterio | `eslint-plugin-boundaries` + `eslint-plugin-import-x` | `dependency-cruiser` |
|---|---|---|
| Se ejecuta dentro de `pnpm lint` y en el editor | Sí (mismo `eslint.config.mjs`) | No: binario aparte, config propia (`.dependency-cruiser.cjs`), segundo comando |
| Modela «módulo» y «capa» como elementos con reglas declarativas | Sí (`elements` + `element-types`, `entry-point` para `index.ts`) | Sí (reglas por regex sobre rutas) |
| Detección de ciclos | Vía `import-x/no-cycle` (con `maxDepth` acotado; coste aceptable en ~12 módulos) | Nativa y con grafo visual |
| Mensajes con archivo + import + regla | Sí, personalizables por regla (`message`) | Sí |
| Prohibir `docs/design/mockups` en `apps/web` | `no-restricted-imports` (patrones) — sin plugin | Sí |
| Mantenimiento | Un solo archivo `boundaries.js` compartido por `nest.js` | Un archivo adicional y un job/paso más |

**Decisión (ADR-0008, Propuesto por `architect`)**: `eslint-plugin-boundaries` (elementos `module`, `layer`,
`shared`) + `eslint-plugin-import-x` (`no-cycle`, `no-relative-packages`) + `no-restricted-imports`, con
`eslint-import-resolver-typescript` para resolver el alias `@nimbo/api/*`. Cubre CA-5 a CA-8 en un solo comando, los
mensajes son propios y no agrega un paso de CI. `dependency-cruiser` **no** se adopta; queda como herramienta opcional
de `/design-check` para generar el grafo al cierre de fase (no en 000, YAGNI).

Reglas codificadas en `packages/config/eslint/boundaries.js` y aplicadas a **`apps/api/src/**` y `apps/worker/src/**`**
(cambio 1 de §11.3: sin reglas sobre el worker, el alias permitiría `@nimbo/api/modules/storage/infrastructure/...`):

1. Elementos: `shared` (`apps/api/src/shared/**`, con sus `layer`), `module` (`apps/api/src/modules/<name>/**`,
   captura `name`), `layer` dentro de módulo o de `shared` (`domain|application|infrastructure|presentation`), `entry`
   (`modules/<name>/index.ts` y `shared/index.ts`), `composition` (`apps/api/src/{main,app.module}.ts`,
   `apps/api/src/migrations/**`, `apps/api/src/scripts/**`, `apps/worker/src/**`).
2. `module:X` solo importa de `module:Y` a través de `entry:Y` y solo si `Y ∈ allowed[X]` (tabla de `architecture.md`
   §3, un objeto literal en el archivo). Mensaje: «`sharing` solo puede importar de `storage` desde
   `modules/storage/index.ts`». `composition` (incluido `apps/worker`) solo importa `entry:*` (`@nimbo/api/shared`,
   `@nimbo/api/modules/<x>`) y nunca rutas internas. (CA-5)
3. `layer:domain` con **lista blanca**: solo `domain/` del mismo módulo, `shared/domain` y `node:*`. Todo lo demás
   está prohibido, lo que incluye `@nestjs/*`, `typeorm`, `bullmq`, `ioredis`, `@aws-sdk/*`, `pino`, **`zod`**,
   **`class-validator`** y **`@nimbo/contracts`**. `layer:application` no importa de `infrastructure` ni
   `presentation`. Mensaje: «`domain` no puede depender de frameworks ni librerías; solo `domain/` y `shared/domain`». (CA-6)
4. `import-x/no-cycle` sobre `apps/api/src/**` y `apps/worker/src/**` con `maxDepth: 6`. (CA-7)
5. En `apps/web`: `no-restricted-imports` con patrones `**/docs/design/mockups/**`, `@mockups/*`; mensaje: «Los mockups son solo referencia». (CA-8)
6. `docs/design/mockups/**` está en `ignores` del flat config y fuera de `pnpm-workspace.yaml` y de `tsconfig` raíz (CA-4).

Fixtures negativos (CA-5 a CA-8) en `packages/config/eslint/__fixtures__/` con una prueba
`packages/config/eslint/boundaries.spec.ts` que ejecuta `ESLint.lintFiles` y afirma el `ruleId` y el mensaje:
`cross-module-internal.ts` (falla), `cross-module-index.ts` (pasa), `domain-imports-nest.ts`,
`domain-imports-typeorm.ts`, **`domain-imports-zod.ts`**, `application-imports-infra.ts`, `cycle-a/index.ts` ↔
`cycle-b/index.ts`, **`worker-imports-internal.ts`** (simula `apps/worker/src` importando
`@nimbo/api/modules/storage/infrastructure/persistence/archivo.orm-entity`), `web-imports-mockup.tsx`. Así el lint
de fronteras se prueba sin ensuciar `apps/api`.

### 6.5 Docker y compose (CA-1, CA-2, CA-3, CA-28, CA-32)

Dockerfiles (`apps/<app>/Dockerfile`, contexto = raíz del repo, `.dockerignore` excluye `docs/`, `specs/`, `**/node_modules`):

| Etapa | api / worker | web |
|---|---|---|
| `base` | `node:22-alpine`, `corepack enable`, `pnpm@10.x` | igual |
| `deps` | `pnpm fetch` con `pnpm-lock.yaml` (caché de capa) | igual |
| `build` | `pnpm install --frozen-lockfile --offline`, `pnpm --filter api... build` (worker: `--filter worker...` incluye `api`) | `pnpm --filter web... build` con `output: 'standalone'` |
| `prod` | `pnpm --filter api deploy --prod /out` (worker: `--filter worker`) | copia `.next/standalone`, `.next/static`, `public` |
| `runtime` | `node:22-alpine`, `USER node` (uid 1000), `ENV NODE_ENV=production`, `ARG APP_VERSION` → `ENV APP_VERSION`, `HEALTHCHECK`, `CMD ["node","dist/main.js"]` | `USER node`, `CMD ["node","server.js"]`, `HOSTNAME=0.0.0.0` |

Sin `devDependencies` (CA-28); `pnpm deploy --prod` produce un `node_modules` aislado. Solo la etapa final se publica.

`compose.yml` (base, raíz):

| Servicio | Imagen | Notas |
|---|---|---|
| `postgres` | `pgvector/pgvector:pg17` | volumen `postgres_data`; healthcheck `pg_isready -U $POSTGRES_USER`; `mem_limit` 1g |
| `redis` | `redis:7-alpine` | `--appendonly yes`; volumen `redis_data`; healthcheck `redis-cli ping` |
| `minio` | `minio/minio` | `server /data --console-address :9001`; volumen `minio_data`; healthcheck `mc ready local`; `minio-init` (imagen `minio/mc`, `infra/minio/init.sh`: `mc mb --ignore-existing`, `mc version enable`) |
| `traefik` | `traefik:v3` | `ports: 80`; providers docker (`exposedByDefault: false`); enrutadores por labels: `web` → `/`, `api` → `PathPrefix(/api)`, `onlyoffice` → `PathPrefix(/docs)` + `stripprefix`, `minio` → `PathPrefix(/s3)` (local) |
| `api` | `${API_IMAGE:-ghcr.io/afmatul/nimbo-api}:${IMAGE_TAG:-latest}` | `env_file: .env`; `depends_on` con `condition: service_healthy`; `mem_limit` 768m |
| `worker` | `${WORKER_IMAGE:-…nimbo-worker}:${IMAGE_TAG:-latest}` | idem; sin puertos; `mem_limit` 768m |
| `web` | `${WEB_IMAGE:-…nimbo-web}:${IMAGE_TAG:-latest}` | `mem_limit` 512m |
| `onlyoffice` | `onlyoffice/documentserver` | **`profiles: [onlyoffice]`**; `JWT_ENABLED=true`, `JWT_SECRET=${ONLYOFFICE_JWT_SECRET}`; `mem_limit` 3g; volumen `onlyoffice_data` |

`compose.override.yml` (local, se carga solo):
- `api`, `worker`, `web`: `build: { context: ., dockerfile: apps/<app>/Dockerfile, target: build }` **o** `dev` con
  `pnpm dev` fuera de Docker (CA-1 usa `pnpm dev` en el host; los tres servicios de app se marcan con
  `profiles: [apps]` en el override para que `docker compose up -d` levante solo dependencias y Traefik enrute al
  host por `host.docker.internal` — ver R-4 en §9).
- Puertos publicados: `5432`, `6379`, `9000`, `9001`, `8025` (Mailpit UI), `1025` (SMTP), `8080` (dashboard Traefik).
  `WORKER_PORT` **no** se publica en ningún ambiente. En el host: `api` 3000, `worker` 3001, `web` 3002 (script `dev`
  de `apps/web`: `next dev -p 3002`), coherente con R-4.
- `mailpit` (`axllent/mailpit`) solo aquí (pregunta 2 resuelta).
- Traefik: `infra/traefik/traefik.local.yml` (sin TLS, `api.insecure` para el dashboard local).

`compose.staging.yml` (se usa con `docker compose -f compose.yml -f compose.staging.yml`, fijado por `COMPOSE_FILE` en
el `.env` del servidor, que Docker lee automáticamente):
- Sin `build`; imágenes `${IMAGE_TAG}` (SHA). Sin `ports` en Postgres/Redis/MinIO. Traefik `ports: 80, 443`.
- `infra/traefik/traefik.staging.yml`: entrypoint `web` → redirección permanente a `websecure`; `certificatesResolvers.letsencrypt.acme`
  con `httpChallenge`, `email=${LETSENCRYPT_EMAIL}`, `caServer=${ACME_CA_SERVER}` (staging de LE hasta estabilizar),
  `storage=/letsencrypt/acme.json` (volumen `traefik_letsencrypt`).
- `infra/traefik/dynamic/headers.yml`: middleware `secure-headers` (`stsSeconds: 31536000`, `stsIncludeSubdomains`,
  `stsPreload`, `contentTypeNosniff`, `frameDeny: true`, `referrerPolicy: strict-origin-when-cross-origin`,
  `browserXssFilter`). Se aplica a `web`, `api`, `minio`. `onlyoffice` recibe `customFrameOptionsValue: SAMEORIGIN`
  (el editor se embebe en 016).
- Enrutadores por host: `Host(\`${WEB_HOST}\`)`, `Host(\`${API_HOST}\`)`, `Host(\`${DOCS_HOST}\`)`,
  `Host(\`${S3_HOST}\`)`; con `WEB_HOST=staging.nimbo.me`, `API_HOST=api.staging.nimbo.me`,
  `DOCS_HOST=docs.staging.nimbo.me`, `S3_HOST=s3.staging.nimbo.me` en el `.env` de staging. Producción (Fase 4)
  reutiliza el archivo con otros hosts (D-4).
- MinIO (cambio 6 de §11.3): el enrutador `s3.staging.nimbo.me` queda **definido pero deshabilitado**
  (`traefik.enable=false` en las labels de `minio`, con comentario «lo activa 005 para URLs firmadas») hasta que 005 lo
  necesite: en 000 no hay ningún consumidor y exponer el API S3 a Internet sin uso es superficie gratuita. La consola
  (`:9001`) nunca tiene enrutador. CA-32 se verifica con `9000`/`9001` cerrados y sin respuesta en `s3.staging`.
- Memoria en demo de 016 (§11.2 punto 10): con el perfil `onlyoffice` activo, `api`/`worker` bajan a 512m
  (`compose.staging.yml` lee `API_MEM_LIMIT`/`WORKER_MEM_LIMIT` con default 768m); swap de 2 GB en el Droplet.
  Documentado en `despliegue.md`.
- Volúmenes con `driver_opts` a `/srv/nimbo/{postgres,redis,minio,onlyoffice,letsencrypt}`.
- `restart: unless-stopped`; `logging: json-file, max-size 20m, max-file 5`.

`.env.example`: todas las variables de `env.schema.ts` (api/worker/web) + las de compose (`POSTGRES_*`,
`MINIO_ROOT_*`, `IMAGE_TAG`, `DOMAIN`, `*_HOST`, `LETSENCRYPT_EMAIL`, `ACME_CA_SERVER`, `ONLYOFFICE_JWT_SECRET`),
con valores locales y vacío en secretos de staging. `scripts/check-env-example.ts` compara las claves del esquema
con las del archivo (CA-19) y verifica que ninguna clave de `SECRET_KEYS` empiece por `NEXT_PUBLIC_`.

### 6.6 CI/CD (CA-24 a CA-31)

`.github/workflows/ci.yml` — `on: pull_request` y `push: main`; `concurrency` por ref; `timeout-minutes: 15` (30 en `integration`); pasos comunes
`actions/checkout` (`fetch-depth: 0` solo en `lint`), `pnpm/action-setup`, `actions/setup-node` (`cache: pnpm`),
`pnpm install --frozen-lockfile`.

| Job (nombre exacto) | Pasos |
|---|---|
| `lint` | `gitleaks/gitleaks-action@v2` (historial completo, `GITLEAKS_ENABLE_UPLOAD_ARTIFACT: false`) → `pnpm lint` → `pnpm env:check` |
| `typecheck` | `pnpm typecheck` |
| `unit` | `pnpm test -- --coverage`; sube `coverage/` como artefacto |
| `integration` | `timeout-minutes: 30`. Pasos: (1) `cp .env.example .env` y `docker compose up -d --wait postgres` (mismo `10-nimbo-app.sh` que local); (2) `scripts/ci/migrations-roundtrip.sh`: `migration:run` → afirma `vector` y una fila de `migracion` por archivo → `migration:revert` hasta 0 filas → afirma ausencia → `migration:run` → afirma de nuevo (CA-11; un `down` vacío o que lanza falla aquí, CA-12); (3) `pnpm test:int` (Testcontainers: `pgvector/pgvector:pg17`, `redis:7-alpine`, MinIO y Mailpit; `globalSetup` único); (4) `pnpm test:isolation` (misma infraestructura; `placeholder.iso-spec.ts` se fuerza a fallar con `ISOLATION_FORCE_FAIL`) |

Cambio del 2026-10-07 (spec §15): `int`, `isolation` y `migrations` eran tres jobs; se unen en `integration` porque
cada job repite checkout, `pnpm install` y descarga de imágenes, y la cuota del repositorio privado es de 3 000 min/mes.

`.github/workflows/build-publish.yml` — `on: push: main` y `pull_request` (construye sin publicar). Matriz
`app: [api, worker, web]`; `docker/setup-buildx-action`, `docker/login-action` (GHCR con `GITHUB_TOKEN`),
`docker/metadata-action` (`images: ghcr.io/afmatul/nimbo-${{ matrix.app }}`, `tags: type=sha,prefix=sha- ; type=raw,value=latest,enable={{is_default_branch}}`),
`docker/build-push-action` (`push: ${{ github.event_name != 'pull_request' }}`, `build-args: APP_VERSION=sha-<short>`,
`cache-from/to: type=gha`). Paso final: `docker run --rm <img> id -u` ≠ 0 (CA-28). Permisos `packages: write`.

`.github/workflows/deploy-staging.yml` — `on: workflow_run` de «build-publish» con `conclusion == success` y rama
`main`; `environment: staging` (secretos `SSH_HOST`, `SSH_USER`, `SSH_KEY`, `STAGING_ENV_FILE`). Pasos por SSH
(`appleboy/ssh-action` o `ssh` con clave en `~/.ssh`), script `infra/deploy/deploy.sh <sha-tag>` versionado en el repo:

```bash
#!/usr/bin/env bash
# infra/deploy/deploy.sh <sha-tag> — transaccional: migra con la imagen nueva ANTES de tocar .env (cambio 7 de §11.3)
set -euo pipefail
NEW_TAG="$1"
cd /opt/nimbo
PREV_TAG="$(grep -E '^IMAGE_TAG=' .env | cut -d= -f2)"
printf '%s\n' "$PREV_TAG" > .previous-tag                       # insumo del rollback

IMAGE_TAG="$NEW_TAG" docker compose pull                         # descarga sin cambiar lo que corre
IMAGE_TAG="$NEW_TAG" docker compose run --rm --no-deps api \
  node dist/scripts/migrate.js run                              # falla → exit ≠ 0: .env intacto, contenedores previos siguen (CA-30)

restore_tag() { sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=${PREV_TAG}/" .env; }
trap 'restore_tag' ERR                                           # cualquier fallo después del sed devuelve .env a la etiqueta previa
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=${NEW_TAG}/" .env
docker compose up -d --remove-orphans
curl -fsS --retry 12 --retry-delay 5 --retry-all-errors "https://${API_HOST}/api/v1/health/ready"
trap - ERR
```

Garantías: (a) si `migrate` falla, `.env` no cambió y un `up -d` manual posterior arranca la imagen **anterior** sobre
el esquema anterior; (b) si `up -d` o el `curl` fallan tras el `sed`, el `trap` restaura `IMAGE_TAG` en `.env` (los
contenedores ya levantados con la nueva imagen se vuelven a bajar con `rollback.sh`, que el job ejecuta como paso
`if: failure()`); (c) `migrate` corre con la imagen nueva, que es la que conoce las migraciones nuevas.

`docs/operations/rollback.md` (CA-31): `infra/deploy/rollback.sh [tag]` (default `$(cat .previous-tag)`) hace
`sed IMAGE_TAG` + `docker compose pull` + `up -d` **sin** ejecutar `migrate.js run` ni `revert` (las migraciones son
aditivas y compatibles con la versión anterior; si una migración no lo fuera, la spec que la introduzca documenta la
reversión). Verificación: `curl -I …/api/v1/health/live` muestra `x-nimbo-version: sha-N-1`. Tiempo objetivo < 10 min;
se registra en `verification.md`.
`docs/operations/despliegue.md` describe el Droplet (`/opt/nimbo`, usuario `deploy` en grupo `docker`, solo clave
SSH), DNS, Let's Encrypt, swap de 2 GB, límites de memoria durante demos con ONLYOFFICE y la protección de `main`
(CA-26, con capturas). `docs/operations/ambientes.md` describe `APP_ENV`/`NODE_ENV`, las variables por ambiente, la
tabla de diferencias base/override/staging (CA-3) y el requisito de arranque: `api` y `worker` necesitan Postgres y
Redis alcanzables al iniciar (`retryAttempts: 10`, `retryDelay: 3000`), garantizado por `depends_on: service_healthy`
(cambio 9).

### 6.7 `apps/web` (CA-29, CA-33)

```
apps/web/
├─ next.config.ts          # output: 'standalone'; reactStrictMode
├─ src/env.ts              # zod: APP_ENV, API_INTERNAL_URL, PORT=3002 (server-only; sin NEXT_PUBLIC_); getEnv() lanza con issues formateadas
├─ src/instrumentation.ts  # register(): valida env al arrancar; si falla escribe la línea config.invalid y process.exit(1) (CA-18)
├─ src/app/layout.tsx      # <html lang="es">, sin CSS
├─ src/app/page.tsx        # Server Component; fetch(`${API_INTERNAL_URL}/api/v1/health/ready`, { cache: 'no-store', signal: AbortSignal.timeout(3000) })
└─ src/lib/api-health.ts   # getApiHealth(): Promise<'disponible' | 'no disponible'> tipado con HealthReadyResponse
```

Texto: «Nimbo», «Ambiente: {APP_ENV}», «API: disponible» / «API: no disponible. Revisa el estado de los servicios.»
y `x-nimbo-version` si la API responde. Sin `globals.css`, sin Tailwind todavía (000b lo agrega). Todo valor público
se lee en el servidor en tiempo de petición → **no hay `NEXT_PUBLIC_*` y no queda nada horneado** (CA-29, sin
excepción). Cuando 002/000b necesiten configuración en el cliente, la expondrán desde un Server Component o una ruta
`/api/config`, no por `NEXT_PUBLIC_`.

`packages/contracts/src/`: `health.ts` (`HealthCheckName = 'postgres'|'redis'|'minio'`, `HealthCheckStatus = 'up'|'down'`,
`HealthLiveResponse`, `HealthReadyResponse` con `checks: Partial<Record<HealthCheckName, HealthCheckStatus>>` y sus
esquemas zod), `error.ts` (`ErrorResponse`, `errorResponseSchema`), `index.ts`. Compilado con `tsc` a `dist/`
(`exports` con `types`). `@nimbo/contracts` es de **presentación**: el lint (§6.4) impide importarlo desde `domain/`.

- Casos de uso: ninguno de negocio.
- Políticas de dominio: ninguna.
- Puertos nuevos (justificar): ninguno fuera de los diagramas (`IClock`, `IHealthIndicator` están en `architecture.md` §5 y `design-model.md` §3 T1).
- Frontend: ruta `app/page.tsx`; sin `features/`, sin `components/`, sin tokens (D-15).

## 7. Observabilidad

- Bitácoras (eventos, todas con `correlationId` automático por `mixin`):
  `api.started` (`port`, `appEnv`, `version`), `worker.started` (`appEnv`, `version`, `queues`), `config.invalid`
  (stderr, antes del logger), `http.request` (pino-http: método, ruta, status, ms; **sin** cuerpo ni query),
  `http.domain_error` (`code`, `status`), `http.unhandled_error` (`err` con stack, solo servidor), `health.ready`
  (solo cuando el resultado es `error`: `checks`), `queue.enqueued` (`queue`, `jobId`), `job.started` /
  `job.completed` / `job.failed` (`queue`, `jobId`, `attemptsMade`), `migration.run` / `migration.revert` (`applied`/`reverted`).
- Métricas: ninguna en 000 (`nimbo_*` llegan con 022; el puerto HTTP del worker ya existe para `/metrics`).
- Alertas nuevas: ninguna (022).

## 8. Estrategia de pruebas

Niveles: `unit` (Jest junto al código), `int` (`apps/api/test/int/**`, Testcontainers), `iso`
(`apps/api/test/isolation/**`), `lint-check` (prueba que ejecuta ESLint sobre fixtures), `ci-check` (paso del workflow
cuya salida es el veredicto), `manual` (procedimiento reproducible con evidencia en `verification.md`).

| Criterio | Nivel | Archivo propuesto |
|---|---|---|
| CA-1 | manual | `specs/000-fundaciones/verification.md` (cronómetro, salida de `curl`, bitácora `worker.started`) + `README.md` |
| CA-2 | ci-check + manual | `.github/workflows/ci.yml` job `lint` paso `docker compose config --services` (sin perfiles ≠ `onlyoffice`; con `--profile onlyoffice` lo incluye); healthcheck de ONLYOFFICE manual |
| CA-3 | manual (revisión) | `docs/operations/ambientes.md` tabla de diferencias base/override/staging; `verification.md` |
| CA-4 | unit | `scripts/repo-structure.spec.ts` (raíz, Jest): existencia de rutas y scripts en `package.json`; `pnpm-workspace.yaml` no incluye `docs/**` |
| CA-5 | lint-check | `packages/config/eslint/boundaries.spec.ts` con `__fixtures__/cross-module-internal.ts` (falla) y `__fixtures__/cross-module-index.ts` (pasa) |
| CA-5 (worker) | lint-check | idem, `__fixtures__/worker-imports-internal.ts` (falla: `apps/worker` importando una ruta interna vía `@nimbo/api/*`) |
| CA-6 | lint-check | idem, `__fixtures__/domain-imports-nest.ts`, `domain-imports-typeorm.ts`, `domain-imports-zod.ts` (lista blanca), `application-imports-infra.ts` |
| CA-7 | lint-check | idem, `__fixtures__/cycle-a/index.ts` ↔ `cycle-b/index.ts` |
| CA-8 | lint-check | idem, `__fixtures__/web-imports-mockup.tsx` |
| CA-9 | ci-check | jobs `lint` y `typecheck` en verde sobre el esqueleto |
| CA-10 | unit | `apps/api/src/shared/infrastructure/persistence/data-source.spec.ts` (`buildDataSourceOptions({ DATABASE_URL })` con `process.env.TYPEORM_SYNCHRONIZE='true'`, `NODE_ENV='development'` → `synchronize === false`; además afirma que importar `shared/index.ts` no lee `process.env` ni construye un `DataSource`) |
| CA-11 | ci-check | job `migrations` (run → aserciones psql → revert → aserciones → run) |
| CA-12 | ci-check (ensayo) | PR de prueba con `down` vacío; enlace a la corrida en `verification.md` |
| CA-13 | int | `apps/api/test/int/shared/correlation-id.int-spec.ts` (sin cabecera → UUID v4; con cabecera válida → eco; inválida → nuevo; bitácoras capturadas con `pino` destino en memoria) |
| CA-14 | int | `apps/api/test/int/shared/ping-queue.int-spec.ts` (Redis real; encola con `correlationId=X`; instancia `PingProcessor` con `Worker` de BullMQ; captura bitácoras y afirma `correlationId`, `jobId`; trabajo sin correlationId genera uno) |
| CA-15 | unit | `apps/api/src/shared/infrastructure/logging/redact-deep.spec.ts` (objeto anidado con los 13 campos + `headers.authorization`; resto intacto) |
| CA-16 | int | `apps/api/test/int/shared/domain-exception-filter.int-spec.ts` (controlador de prueba definido en el spec lanza `SharedExampleNotFoundError extends NotFoundError`; 404 + cuerpo exacto; sin `stack`; error genérico → 500 `INTERNAL_ERROR`) |
| CA-17 | unit | `apps/api/src/shared/index.spec.ts` (importa `./index` y afirma exportaciones; `Actor` con tres claves vía tipo `Expect<Equal<keyof Actor, 'id'|'role'|'canReadContent'>>`) |
| CA-18 | unit + int | `apps/api/src/shared/infrastructure/config/load-env.spec.ts` (`loadEnv` puro: falta `DATABASE_URL`, `PORT=abc` → `{ ok: false, issues }` con los mensajes exactos y sin el valor de `MINIO_SECRET_KEY`); `apps/api/test/int/shared/bootstrap.int-spec.ts` y `apps/worker/test/int/bootstrap.int-spec.ts` (lanzan `main` como subproceso con `.env` incompleto: código ≠ 0, una sola línea `config.invalid`, ningún puerto abierto); `apps/web/src/env.spec.ts` para el esquema de `web` |
| CA-19 | unit + ci-check | `scripts/check-env-example.spec.ts` + paso `pnpm env:check` en `lint` |
| CA-20 | int | `apps/api/test/int/shared/health.int-spec.ts`: arrancar con los tres contenedores arriba, **detenerlos**, y afirmar que `live` sigue respondiendo `200 { "status": "ok" }` en < 100 ms sin tocar dependencias (cambio 9; la app no arranca sin Postgres/Redis, ver §6.2) |
| CA-21 | int | idem (los tres arriba → 200, cuerpo exacto, < 2 s) |
| CA-22 | int | idem (`redisContainer.stop()` → 503, cuerpo exacto, < 3 s, cuerpo no contiene `localhost`, puertos, `MINIO_*`, `Error`) |
| CA-23 | int + manual | `apps/worker/test/int/worker-health.int-spec.ts` (Redis detenido → `ready` 503); ensayo con `docker inspect --format '{{.State.Health.Status}}'` en `verification.md` |
| CA-24 | ci-check | `ci.yml` con seis jobs; captura de los status checks y duración total |
| CA-25 | ci-check (ensayo) | Seis PRs de prueba (o uno con seis commits) con enlaces en `verification.md` |
| CA-26 | manual | Capturas de la protección de `main` y de los rechazos en `verification.md` |
| CA-27 | ci-check + manual | Salida de `gitleaks detect --source . --log-opts=--all` en `security.md`; commit de prueba con clave ficticia que hace fallar `lint` |
| CA-28 | ci-check | `build-publish.yml` paso `id -u`; inspección de etiquetas en ghcr.io (`verification.md`) |
| CA-29 | manual | Misma imagen con `.env` local y de staging; `web` sin `NEXT_PUBLIC_` (`grep` en `.next/standalone` como paso del job de build) |
| CA-30 | ci-check | Corrida de `deploy-staging` + `curl` final; ensayo con migración fallida en `verification.md` |
| CA-31 | manual | Ensayo de rollback con tiempo medido en `verification.md` |
| CA-32 | manual | `nmap -p 80,443,5432,6379,9000,9001 <ip>`, `curl -I https://staging.nimbo.me` (cabeceras) y `curl -sS https://s3.staging.nimbo.me` → 404 de Traefik (enrutador deshabilitado hasta 005) en `verification.md` |
| CA-33 | unit | `apps/web/src/app/page.spec.tsx` (render con `fetch` simulado en `disponible` y `no disponible`; contiene «Nimbo» y `APP_ENV`); prueba manual en staging |

Cobertura: umbral 60 % en `apps/api/src/shared/**` (`jest/base.cjs`).

## 9. Riesgos y mitigaciones

| # | Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|---|
| R-1 | 000 bloquea a 000b/001/006a (tres personas esperando) | Alta | Alto | Orden de entrega en §9b: PR-1 esqueleto + contratos + compose local en los primeros 2 días; PR-2 `shared`; PR-3 CI; deploy después. Cada PR < 400 líneas sin pruebas |
| R-2 | Testcontainers en runners públicos supera los 15 min o falla por Docker | Media | Medio | Un `globalSetup` por suite; imágenes ligeras; caché de pnpm y de capas; `migrations` usa `services:` (más barato). Si `int` excede 6 min, pasar `int` a `services:` |
| R-3 | Alias `@nimbo/api/*` desde `worker` complica build/Jest/Docker | Media | Medio | `tsc -b` con referencias + `tsc-alias`; `moduleNameMapper`; `eslint-import-resolver-typescript`; prueba en Docker en el PR-1. Alternativa aprobada por `architect` (§11.2, no rompe ADR-0001: la separación es por proceso e imagen): mover `main.ts` del worker a `apps/api/src/worker.main.ts` y dejar `apps/worker` como paquete delgado. Condiciones: imagen `nimbo-worker` propia con su `HEALTHCHECK`; `apps/worker` conserva `package.json`, `Dockerfile` y `healthcheck.ts` (CA-4); `worker.main.ts` obedece el mismo lint (solo `shared` e `index.ts` de módulos); se anota en este §9 y en `verification.md` qué ruta se tomó |
| R-3 (decisión, 2026-09-16, T-06) | **Se tomó la alternativa**: la ruta canónica falló en `typecheck` (TS6305: exige `apps/api/dist` compilado) y en runtime (`tsc-alias` no reescribe rutas fuera de `rootDir`; `Cannot find module '@nimbo/api/shared'`). `apps/api/src/worker.main.ts` + `worker.module.ts` son raíces de composición compiladas por `nest build`; `apps/worker` conserva `package.json`, `src/healthcheck.ts` y (T-35) `Dockerfile`. §6.3 y §6.4 se leen con esa precisión: el elemento `composition` incluye `worker.main.ts`/`worker.module.ts` y no hay alias que resolver. Detalle en `tasks.md` «Notas del developer» | — | — | — |
| R-4 | En local, `pnpm dev` corre en el host mientras Traefik está en Docker: `localhost/api/v1` debe llegar al host | Media | Bajo | Override con `extra_hosts: host.docker.internal:host-gateway` y enrutadores hacia `host.docker.internal:3000/3002`; documentado en README. Alternativa: perfil `apps` que corre las apps en contenedores |
| R-5 | Let's Encrypt bloquea por iteraciones (5 fallos/h) | Media | Medio | `ACME_CA_SERVER` apuntando al staging de LE hasta que `traefik.staging.yml` esté estable; cambiar a producción una sola vez |
| R-6 | Droplet de 4 GB: api+worker+web+postgres+redis+minio+traefik ≈ 2 GB; ONLYOFFICE +3 GB → OOM | Alta con ONLYOFFICE | Alto | `mem_limit` por servicio; perfil `onlyoffice` apagado; swap de 2 GB en el Droplet (documentado en `despliegue.md`) |
| R-7 | `pgvector` no disponible o `CREATE EXTENSION` sin privilegio en algún ambiente | Baja | Alto | Imagen oficial `pgvector/pgvector:pg17` en los tres ambientes; usuario de la app es el superusuario del contenedor en local/staging (revisar en 022 si se separa un rol de app) |
| R-8 | Redacción profunda con `hooks.logMethod` degrada el rendimiento del logger | Baja | Bajo | `redactDeep` solo recorre objetos planos ≤ 16 niveles, ignora `Buffer`/`Error`; microbenchmark en la prueba unitaria (< 50 µs por línea típica) |
| R-9 | Dominio `nimbo.me` tarda en propagarse | Media | Medio | Mientras tanto `*.<ip>.sslip.io` con la misma configuración (solo cambian `*_HOST`) |
| R-10 | Crédito del Student Pack | Baja en Fase 1 | Medio | Registro mensual en `verification.md`; un Droplet hasta Fase 4 |
| R-13 | Cuota de GitHub Pro en repo privado (3 000 min Actions, 2 GB Packages) | Media | Medio | `concurrency` + `cancel-in-progress`; CI solo en `pull_request` y `push: main`; retención de imágenes (T-37); si se agota, hacer público el repo sin cambios de código |
| R-11 | `shared` crece como cajón de sastre después de 000 (§11.5) | Media | Medio | Regla: `shared` solo aloja lo que usan ≥ 3 módulos o lo que el proceso necesita antes de que exista un módulo; el `reviewer` lo verifica en cada PR que toque `apps/api/src/shared` |
| R-12 | `apps/worker/src` acumula lógica propia en lugar de componer módulos de `api` (§11.5) | Baja | Medio | Solo `main.ts`, `worker.module.ts`, `healthcheck.ts`; cualquier otro archivo se rechaza en revisión |

### 9a. Dependencias y compuertas (cambio 10 de §11.3)

| # | Dependencia | Estado hoy | Quién | Bloquea a |
|---|---|---|---|---|
| D-1 | ADR-0001, 0002, 0008, 0009 pasan de `Propuesto` a `Aceptado`; ADR-0010 **se redacta** (`/adr`, `architect`) y se acepta | 0001/0002/0008/0009 `Propuesto`; 0010 sin redactar | equipo (reunión) + `architect` | **PR-3 «CI»** (fija `boundaries.js` con la lista de módulos de ADR-0010) |
| D-2 | DF-02, DF-03, DF-30, DF-34 → `Aceptado` (al aceptar ADR-0010) | `Abierto` | equipo | PR-3 |
| D-3 | DF-06, DF-23, DF-24 → `Aceptado` (regla `typeorm-columns.js`) | `Abierto` | equipo | PR-3 |
| D-4 | DF-49 `Aceptado`; ADR-0015 (dependencias de fundaciones) `Propuesto` → `Aceptado` | DF-49 aceptado; ADR-0015 propuesto | equipo | PR-2 usa zod/nestjs-pino/Testcontainers; el ADR puede aceptarse en la misma reunión que D-1 |

Mientras D-1/D-2 no se cumplan, PR-1 y PR-2 pueden avanzar (no dependen de la lista de módulos). Si la reunión se
retrasa más allá del día 3, PR-3 se abre con `boundaries.js` tomando la lista de `architecture.md` §3 tal cual y se
anota en el PR que el ADR-0010 está pendiente; el merge del PR-3 espera a la aceptación.

### 9b. Orden de entrega (PRs pequeños, desbloquean primero)

1. **PR-1 «esqueleto»** (día 1–2): `pnpm-workspace.yaml`, `package.json` raíz con scripts, `packages/config`,
   `packages/contracts` (health/error con `checks` parcial), `apps/api` mínimo (`main.ts`, `HealthController` `live`),
   `apps/web` página (puerto 3002), `apps/worker` mínimo (verifica el alias `@nimbo/api/*` en Docker; decide R-3),
   `.env.example`, `compose.yml` + `compose.override.yml`, `README.md`, **y las carpetas de los 12 módulos**
   (`apps/api/src/modules/{identity,storage,access,sharing,billing,editing,intelligence,optimizer,backoffice,audit,realtime,notifications}/`
   con `index.ts` vacío y `README.md` mínimo con dueño y capas) para que cada dueño empiece sin conflictos de
   archivos (precisión de `tasks.md` T-05, §12). Desbloquea 000b (web) y 001/006a.
2. **PR-2 «shared»** (día 2–4): `Actor`, `IClock`, `DomainError`, filtro, logger + redacción, `correlationId`,
   `loadEnv` puro, `HealthModule` completo (application/infrastructure/presentation), cola `ping`,
   `buildDataSourceOptions` + `data-source.cli.ts` + migración inicial + `migrate.ts`. Desbloquea 001 (errores,
   logger, repositorios) y 006a (migraciones).
3. **Compuerta D-1..D-3** (§9a, antes de abrir o al menos antes de mergear el PR-3): reunión del equipo que acepta
   ADR-0001/0002/0008/0009/0010/0015 y marca `Aceptado` DF-02, 03, 30, 34, 06, 23, 24.
4. **PR-3 «CI»** (día 3–5): `ci.yml` con seis jobs, lint de fronteras + fixtures (incluidos `worker-imports-internal`
   y `domain-imports-zod`), `typeorm-columns.js`, gitleaks, `env:check`, protección de `main` (manual). Desde aquí
   todo PR ajeno entra con CI.
5. **PR-4 «imágenes»** (día 5–6): Dockerfiles, `build-publish.yml`.
6. **PR-5 «staging»** (día 6–8): `compose.staging.yml` (enrutador `s3` deshabilitado), Traefik TLS,
   `deploy-staging.yml` + `deploy.sh`/`rollback.sh` transaccionales, `docs/operations/*`, ensayos de CA-25, CA-30,
   CA-31, CA-32, gitleaks del historial (CA-27) y publicación del repositorio.

## 10. Decisiones

- ADR (estado tras la aprobación del `architect`, ver §11.4 y `docs/adr/README.md`):
  - **ADR-0008** `Propuesto`: lint de fronteras con `eslint-plugin-boundaries` + `eslint-plugin-import-x` +
    `no-restricted-imports` + `eslint-import-resolver-typescript`; reglas sobre `apps/api` y `apps/worker`; lista
    blanca en `domain`. Aplicado en §6.4.
  - **ADR-0015** `Propuesto` (`docs/adr/0015-dependencias-de-fundaciones.md`): gitleaks en CI (D-10), zod, `nestjs-pino`, Testcontainers.
  - **ADR-0001** (separación `api`/`worker` por proceso e imagen; salud por proceso), **ADR-0002** (TypeORM,
    migraciones manuales, tabla `migracion`), **ADR-0009** `Propuesto`.
  - **ADR-0010** pendiente de redactar por `architect`; define la lista de módulos de `boundaries.js`.
  - Compuerta: todos pasan a `Aceptado` antes del PR-3 (§9a).
- Decisiones tomadas por `architect` (§11.1) e incorporadas: salud en `shared` (DF-49); `compose*.yml` en la raíz;
  `migrationsTableName: 'migracion'`; salud del worker por HTTP interno sin publicar y sin `/api/v1`.
- Sin preguntas abiertas para `architect`.

## 11. Aprobación de arquitectura
> Sección escrita por el subagente `architect` · 2026-09-15.

### 11.0 Veredicto final (segunda revisión, 2026-09-15)

- **Veredicto: Aprobado.** Verifiqué punto por punto que los diez cambios de §11.3 están aplicados en el cuerpo:
  (1) lint sobre `apps/worker/src/**` con resolver de TypeScript, elemento `composition`, `domain` con lista blanca y
  fixtures `worker-imports-internal.ts`/`domain-imports-zod.ts` (§6.4); (2) `IHealthIndicator` + `HealthService` en
  `shared/application/health/`, indicadores en `infrastructure/health/`, módulos en la raíz de `shared/` (§6.2);
  (3) `SharedModule` sin `forRoot`, raíces de composición explícitas (§6.2, §6.3); (4) sin `pnpm … ping`, sin
  `CORS_ORIGIN`, sin `CODEOWNERS`; `index.ts` exporta los tres indicadores y no `PingQueue`/`HealthService` (§6.1, §6.2);
  (5) `HealthReadyResponse.checks` parcial, un solo contrato (§5); (6) enrutador `s3.staging` definido y deshabilitado
  hasta 005, verificación en CA-32 (§6.5, §8); (7) `deploy.sh` migra con la imagen nueva antes del `sed`, `trap` de
  restauración y `rollback.sh` en `if: failure()` (§6.6); (8) `buildDataSourceOptions` pura, `AppDataSource` en
  `migrations/data-source.cli.ts` sin reexportar, `loadEnv` puro y salida en `main.ts` (§4, §6.2); (9) prueba de CA-20
  deteniendo contenedores tras el arranque y nota de `retryAttempts` (§6.2, §8); (10) compuerta §9a con ADR/DF y
  bloqueo del merge del PR-3. Las observaciones menores (a) y (b) también quedaron; (c) es de la spec.
- Compuerta vigente (no es cambio al plan): el merge del PR-3 «CI» espera la aceptación de ADR-0001/0002/0008/0009/0010
  y DF-02/03/30/34/06/23/24 (§9a). ADR-0010 lo redacta `architect`.
- El plan puede pasar a `tasks.md`.

### 11.0b Primera revisión (2026-09-15) — se conserva como historial

- **Veredicto: Aprobado con cambios.** Los cambios 1–9 se incorporan al plan antes de `tasks.md`; el cambio 10 (DF y
  ADR aceptados por el equipo) condiciona el PR-3 «CI», no el PR-1.

### 11.1 Decisiones que el planner dejó al `architect`

| # | Pregunta | Decisión | Dónde quedó |
|---|---|---|---|
| 1 | `HealthController`/`IHealthIndicator` en `shared` o `modules/backoffice/` mínimo | **`shared`**. Crear `backoffice` solo para la salud haría que `worker` importara un módulo que, según §3 de `architecture.md`, depende de `identity`, `billing` y `storage`; y la salud no tiene reglas de negocio ni rol. Se registra **DF-49** (`Aceptado`), se mueven `HealthController`, `HealthService`, `IHealthIndicator` y los tres indicadores a T1. `OnlyOfficeHealthIndicator` (DF-29) lo aportará `editing` y se registra en `HealthModule.forRoot({ indicators })` desde la raíz de composición. | `design-findings.md` DF-49; `design-model.md` §2 T1, §3 M8 y nuevo bloque T1; `architecture.md` §3 y §5. **Diagrama a redibujar**: Clases M8 (quitar salud) + bloque T1 `shared` |
| 2 | `compose*.yml` en la raíz, `infra/` solo configuraciones | **Confirmado.** | `architecture.md` §2 (árbol y nota) |
| 3 | `migrationsTableName: 'migracion'` | **Confirmado**: `conventions.md` §BD aplica a todo el esquema, incluida la tabla técnica; el nombre no se puede cambiar después sin migración manual, así que se fija ahora. | ADR-0002 |
| 4 | Salud del worker por HTTP interno (`WORKER_PORT`) | **Confirmado**, con la condición de que `WORKER_PORT` nunca aparezca en `ports:` de ningún compose y que la ruta no lleve prefijo `/api/v1` (no es API pública). 022 reutiliza el puerto para `/metrics`. | ADR-0001 (salud por proceso) |
| 5 | Herramienta de lint de fronteras | **`eslint-plugin-boundaries` + `eslint-plugin-import-x` (`no-cycle`) + `no-restricted-imports`**, sin `dependency-cruiser`. Ajustes obligatorios respecto a §6.4: las reglas también cubren `apps/worker/src/**` (alias `@nimbo/api/*` resuelto con `eslint-import-resolver-typescript`) y `layer:domain` usa lista blanca (solo `domain/` del módulo, `shared/domain` y `node:*`), lo que prohíbe `zod`, `class-validator` y `@nimbo/contracts` además de los paquetes ya listados. | ADR-0008 (Propuesto) |

### 11.2 Evaluación por punto

1. **Fronteras** — Correcto en lo esencial: `shared` no importa de nadie; `worker` solo por `@nimbo/api/shared`
   (§6.3). Dos observaciones: (a) el glob de `entities` en `buildDataSourceOptions` (§4) recorre
   `modules/**/infrastructure/persistence/*.orm-entity.*`; es aceptable como **raíz de composición** (la CLI de TypeORM
   lo necesita) siempre que ningún código de `shared` importe esas clases; en Nest se usa `autoLoadEntities: true`.
   (b) `shared/health/health.module.ts` (§6.2) crea una cuarta carpeta fuera de las capas; ver cambio 2.
2. **Grafo de dependencias** — Sin dependencias nuevas; el DAG de §3 queda codificado en `boundaries.js` (un solo
   archivo, edita `architect`). Riesgo cubierto por el cambio 1: sin reglas sobre `apps/worker`, el alias permitiría
   `@nimbo/api/modules/storage/infrastructure/...`.
3. **Capas** — `Actor`, `Role`, `IClock`, `FixedClock`, `DomainError` en `shared/domain` sin Nest/TypeORM/zod: correcto.
   zod no filtra al dominio: `env.schema.ts`/`loadEnv` viven en `infrastructure/config`, los esquemas de
   `packages/contracts` son de presentación y la lista blanca del cambio 1 lo hace cumplir. `HealthController` solo
   delega en `HealthService`. **Desviación**: `IHealthIndicator` (puerto) y `HealthService` («service») están bajo
   `infrastructure/health/` (§6.2); un puerto que vive junto a sus implementaciones no invierte nada → cambio 2.
4. **YAGNI** — Ningún módulo funcional se crea en 000 (correcto). La cola `ping` es aceptable: CA-14 la pide
   explícitamente, es la única forma real de probar la propagación de `correlationId` a BullMQ y no toca datos; no va
   a `architecture.md` §8 por no ser de negocio. Sobra: `SharedModule.forRoot({ role })` (un parámetro que solo
   alimenta un condicional; las raíces de composición pueden componer), el comando opcional `pnpm --filter api ping`,
   `CORS_ORIGIN` (nadie habilita CORS en 000; el navegador no llama a la API hasta 002) y `CODEOWNERS (opcional)`.
   Se conservan `VersionHeaderMiddleware` (CA-31), `redactDeep` (pino no redacta a profundidad arbitraria) y
   `typeorm-columns.js` (spec §13 lo pide para DF-06/23/24). → cambios 3 y 4.
5. **DRY** — Correcto: `REDACTED_FIELDS` + `SECRET_KEYS` como única fuente; un `DomainExceptionFilter`; un runner de
   migraciones; contratos de salud y error solo en `packages/contracts`; `buildDataSourceOptions` compartida por
   `api`, `worker` y CLI. Falta declarar en `packages/contracts` que `checks` es parcial (`worker` solo reporta
   `redis`) para no tener dos contratos → cambio 5.
6. **SOLID** — `HealthService` orquesta e indicadores de una dependencia (S, O); `HealthModule.forRoot({ indicators })`
   permite agregar `OnlyOfficeHealthIndicator` sin editar `shared` (O). El filtro mapea por `instanceof` las **cinco
   clases base** (cerradas); los errores concretos de cada módulo extienden una de ellas, así que agregar un error no
   toca el filtro y el dominio no conoce códigos HTTP. Aceptable.
7. **Seguridad estructural** — `Actor` con exactamente tres campos; sin datos de cliente; salud sin topología
   (CA-22); puertos internos no publicados; consola de MinIO sin enrutador; cabeceras en Traefik. Observación: el
   enrutador `s3.staging.nimbo.me` expone el API S3 de MinIO a Internet sin ningún consumidor hasta 005 → cambio 6.
8. **Integridad** — Migración inicial con `down` real y `transaction: 'each'`; `ping` idempotente. Tres defectos:
   (a) `deploy.sh` cambia `IMAGE_TAG` en `.env` **antes** de `migrate`; si la migración falla, un `up -d` manual
   posterior arrancaría la imagen nueva sobre un esquema viejo → cambio 7. (b) `AppDataSource = new DataSource(…loadEnv())`
   a nivel de módulo ejecuta `loadEnv()` (con `process.exit`) al **importar** `data-source.ts`, que `shared/index.ts`
   reexporta: cualquier prueba unitaria que importe `shared` puede matar el proceso → cambio 8. (c) `loadEnv()` con
   `process.exit` dentro es difícil de probar; la salida pertenece a `main.ts`.
9. **Degradación** — `live` no consulta dependencias y `ready` responde `503` con tiempo límite: correcto. Pero §8
   afirma que CA-20 se prueba «sin contenedores arriba»: con `TypeOrmModule.forRoot` y `BullModule` el arranque de
   Nest **no termina** si Postgres o Redis no responden, así que `live` nunca respondería. Es un comportamiento
   aceptable (compose usa `depends_on: service_healthy` y `restart`), pero la prueba debe reflejar la realidad →
   cambio 9.
10. **Recursos** — Staging 4 GB: `postgres` 1g + `api` 768m + `worker` 768m + `web` 512m + redis/minio/traefik ≈ 3.4 GB
    sin ONLYOFFICE; con el perfil activo (3g) se depende de la swap de 2 GB (R-6). Aceptado como riesgo de demo:
    ONLYOFFICE se enciende solo para 016 y con `api`/`worker` reducidos a 512m durante la demo (documentar en
    `despliegue.md`). Concurrencia de colas: `ping` sin concurrencia configurada, correcto en 000.
11. **Datos** — Solo `CREATE EXTENSION vector`; sin columnas especulativas; `migracion` en español singular. Correcto.
12. **Coherencia con los diagramas** — DF-49 registrado y documentos textuales actualizados; el PDF de clases M8 se
    redibuja al cierre de Fase 1. DF-29 queda `Abierto` (parcial: Redis en 000). **Bloqueo condicional**: DF-02,
    DF-03, DF-30, DF-34 (lista de módulos del lint) y DF-06, DF-23, DF-24 (regla `typeorm-columns.js`) siguen
    `Abierto`; el equipo debe marcarlos `Aceptado` (los cuatro primeros al aceptar ADR-0010) antes de que el PR-3
    fije `boundaries.js` → cambio 10.

Sobre la alternativa **R-3** (`apps/api/src/worker.main.ts` + `apps/worker` delgado): **no rompe** `architecture.md`
§1, porque la separación `api`/`worker` es por proceso e imagen (así queda escrito en ADR-0001 y §1), no por carpeta.
Condiciones si se adopta: imagen `nimbo-worker` propia con su `HEALTHCHECK`, `apps/worker` conserva `package.json`,
`Dockerfile` y `healthcheck.ts` (CA-4), `worker.main.ts` obedece las mismas reglas de lint (solo `shared` e `index.ts`
de módulos) y se anota en §9 del plan y en `verification.md` cuál de las dos rutas se tomó.

### 11.3 Cambios requeridos

1. **Lint de fronteras** (§6.4): aplicar `boundaries.js` también a `apps/worker/src/**` con
   `eslint-import-resolver-typescript` para el alias `@nimbo/api/*`; `layer:domain` con lista blanca (`domain/` del
   módulo, `shared/domain`, `node:*`); `import-x/no-cycle` sobre ambas apps. Agregar *fixtures* negativos
   `worker-imports-internal.ts` y `domain-imports-zod.ts`.
2. **Capas de la salud** (§6.2): `IHealthIndicator` y `HealthService` pasan a `shared/application/health/`; los tres
   indicadores quedan en `shared/infrastructure/health/`; `health.module.ts` y `shared.module.ts` van en la raíz de
   `shared/` (como `storage.module.ts` en `architecture.md` §4). Eliminar la carpeta `shared/health/`.
3. **`SharedModule` sin parámetros**: quitar `forRoot({ role })`. `SharedModule` registra config, logger, TypeORM
   (`autoLoadEntities: true`) y la conexión BullMQ; `AppModule` importa `HealthModule.forRoot({ indicators: [Postgres, Redis, Minio] })`
   y `PingQueue`; `WorkerModule` importa `HealthModule.forRoot({ indicators: [Redis] })` y `PingProcessor`.
4. **Recortes YAGNI**: eliminar el comando `pnpm --filter api ping`, la variable `CORS_ORIGIN` (la agrega 001 con el
   `ThrottlerModule`) y `CODEOWNERS`. `shared/index.ts` **no** exporta `PingQueue` ni `HealthService` (ningún módulo
   los usa; la prueba de CA-14 importa `PingQueue` por ruta interna, permitido para pruebas del propio módulo) y **sí**
   exporta `PostgresHealthIndicator`, `RedisHealthIndicator`, `MinioHealthIndicator` (el worker los necesita; hoy
   faltan en la lista de §6.2).
5. **Contrato de salud**: `HealthReadyResponse.checks` se declara como `Partial<Record<HealthCheckName, HealthCheckStatus>>`
   con la nota de que `api` reporta los tres y `worker` solo `redis`; una sola definición para ambos procesos.
6. **MinIO en staging**: el enrutador `s3.staging.nimbo.me` queda **definido pero deshabilitado** (`traefik.enable=false`
   o labels comentadas) hasta que 005 lo active; CA-32 se verifica con `9000/9001` cerrados. `architecture.md` §1 ya lo
   dice.
7. **`deploy.sh` transaccional**: guardar `.previous-tag`, ejecutar `migrate` con la imagen nueva **antes** de tocar
   `.env` (`IMAGE_TAG=<sha> docker compose run --rm --no-deps api node dist/scripts/migrate.js run`) y solo entonces
   hacer `sed` + `up -d`; `trap` que restaura `IMAGE_TAG` si algo falla después del `sed`.
8. **`data-source.ts` sin efectos al importar**: `buildDataSourceOptions` pura en `shared/infrastructure/persistence/data-source.ts`
   (exportada por `index.ts`); `AppDataSource` en `apps/api/src/migrations/data-source.cli.ts` (o `scripts/`), usado
   solo por la CLI de TypeORM y por `migrate.ts`, **no** reexportado. `loadEnv()` devuelve `{ ok, env } | { ok: false, issues }`;
   `main.ts` de `api` y `worker` escriben la línea `config.invalid` y llaman `process.exit(1)`.
9. **Prueba de CA-20** (§8): arrancar la app con los contenedores arriba, detenerlos y afirmar que `live` sigue
   respondiendo `200` en < 100 ms; documentar en `ambientes.md` que `api`/`worker` requieren Postgres y Redis
   alcanzables al arrancar (`retryAttempts: 10`, `retryDelay: 3000`) y que compose lo garantiza con
   `depends_on: service_healthy`.
10. **Compuerta de DF/ADR antes del PR-3**: el equipo acepta ADR-0001, 0002, 0008, 0009 y 0010 (pasan de `Propuesto`/
    `Pendiente` a `Aceptado`) y marca `Aceptado` DF-02, DF-03, DF-30, DF-34, DF-06, DF-23, DF-24. ADR-0010 aún no está
    redactado: lo redacta `architect` con `/adr` antes del PR-3; hasta entonces `boundaries.js` usa la lista de
    `architecture.md` §3 tal cual.

Observaciones menores (no bloquean): (a) `PORT` por defecto 3000 en `api` choca con el 3000 por defecto de `next dev`;
fijar `web` en 3002 en `.env.example` y en el script `dev` de `apps/web` (R-4 ya lo asume). (b) `apps/web/src/env.ts`
también debe abortar el arranque con una línea (`config.invalid`) para cumplir CA-18 en las tres apps. (c) Registrar
en spec §15 la precisión de rutas de salud del worker (sin prefijo `/api/v1`).

### 11.4 ADR y documentos tocados en esta aprobación

- ADR creados (`Propuesto`): `docs/adr/0001-monolito-modular-con-worker-separado.md`,
  `docs/adr/0002-nestjs-typeorm-migraciones-manuales.md`, `docs/adr/0008-verificacion-automatica-de-fronteras.md`,
  `docs/adr/0009-crystal-clear-y-sdd-como-proceso.md`, `docs/adr/0015-dependencias-de-fundaciones.md`;
  `docs/adr/README.md` actualizado. Pendiente de redactar: ADR-0010.
- `docs/sdd/architecture.md`: §1 (hospedaje DigitalOcean, `nimbo.me`, separación por proceso/imagen), §2
  (`compose*.yml` en la raíz, `infra/` solo configuraciones, procesadores dentro de los módulos), §3 y §5 (salud en
  `shared`, DF-49), §10 (ADR-0014, 0015).
- `docs/sdd/design-model.md`: §2 T1, §3 M8 y nuevo bloque «T1 `shared`».
- `docs/sdd/design-findings.md`: DF-49 (Aceptado), DF-29 (nota parcial), resumen por spec.
- `docs/sdd/product-context.md` §8: proveedor, registro de imágenes y dominios.

### 11.5 Riesgos arquitectónicos a vigilar

- Que `apps/worker` termine con lógica propia en lugar de componer módulos de `api` (señal: archivos en
  `apps/worker/src` distintos de `main.ts`, `worker.module.ts`, `healthcheck.ts`).
- Que el alias `@nimbo/api/*` se use fuera de `shared` e `index.ts` (el lint del cambio 1 lo bloquea; revisar en el PR-1).
- Que `shared` crezca como cajón de sastre: todo lo que entre después de 000 debe justificar por qué no pertenece a un
  módulo (regla: `shared` solo aloja lo que usan ≥ 3 módulos o lo que el proceso necesita antes de que exista un módulo).
- `int` + `isolation` con Testcontainers por encima de 6 min (R-2): migrar a `services:` salvo las pruebas que
  detienen contenedores.
- ONLYOFFICE en el Droplet de 4 GB (R-6): el ensayo de 016 debe hacerse con `api`/`worker` a 512m y swap activa.

## 12. Registro de cambios del plan

| Fecha | Cambio | Motivo | Quién |
|---|---|---|---|
| 2026-09-15 | Plan creado (Propuesto) | /plan 000 | planner |
| 2026-09-15 | §11 Aprobación de arquitectura: Aprobado con cambios; DF-49; ADR 0001/0002/0008/0009/0015 | Revisión | architect |
| 2026-09-15 | §11.0: segunda revisión, veredicto **Aprobado**; cabecera y `specs/README.md` actualizados | Verificación de los cambios | architect |
| 2026-09-15 | Cambios 1–10 de §11.3 aplicados a §1, §3, §3b, §4, §5, §6.1–§6.7, §8, §9 (+§9a, R-11, R-12), §9b y §10; observaciones menores (a) puerto 3002 de `web`, (b) `env.ts` de `web` aborta con `config.invalid`. §11 intacta | Incorporar la aprobación | planner |
| 2026-09-16 | R-3 resuelto por la alternativa (`worker.main.ts` en `apps/api`); fila añadida en §9 | Evidencia de T-06: alias falla en `typecheck` y en runtime sin trucos | developer |
| 2026-09-16 | Precisión en §9b PR-1: el esqueleto crea las carpetas de los 12 módulos con `index.ts` vacío y `README.md` mínimo (tarea T-05 de `tasks.md`). No cambia diseño ni alcance | Evitar conflictos de archivos entre dueños al arrancar 000b/001/006a | planner |
| 2026-09-16 | D-2 pasa a repositorio **privado** (GitHub Pro); R-13 nuevo; T-31 restringe disparadores y T-37 agrega retención de imágenes | Decisión de Adrián | Adrián |
| 2026-09-19 | Refactor de T-16: se elimina `resolveSharedEnv` (adivinaba el proceso probando dos esquemas y revalidaba lo que `main.ts`/`worker.main.ts` ya validaron); `env.schema.ts` expone el esquema base `SharedEnvBase`; `EnvModule.forRoot(env)` (`@Global`, `useValue`) recibe el entorno de la raíz de composición; token nuevo `MINIO_CONFIG` (`MinioConfigModule.forRoot`) con las cinco variables de MinIO y `MinioHealthIndicator` sin comprobación en tiempo de ejecución; `AppModule.forRoot(env)` y `WorkerModule.forRoot(env)`. §6.2 actualizada (lista de exportaciones y tabla de raíces). **`SharedModule` sigue sin parámetros** (§11.3 cambio 3) | OCP (un proceso nuevo no obliga a tocar `shared`), DIP (`shared` depende del contrato mínimo `SharedEnvBase`, no de la unión de entornos), ISP (el indicador de MinIO recibe solo lo que usa) y DRY (una sola validación por proceso) | Adrián (arquitecto) + developer |
| 2026-09-21 | **Defecto de CA-1 corregido**: ningún punto de entrada cargaba el `.env` de la raíz (no hay `dotenv` ni `--env-file`), así que `pnpm --filter api migration:run` y `pnpm dev` (api y worker) morían con `config.invalid` justo después de `cp .env.example .env`; solo `web` arrancaba porque Next.js lee `.env` por su cuenta. Se agrega `shared/infrastructure/config/load-dotenv-file.ts` (`loadDotenvFile`, `repoDotenvPath`) sobre `process.loadEnvFile` de Node 22 (sin dependencias nuevas, sin ADR) y se llama en `main.ts`, `worker.main.ts` y `migrations/data-source.cli.ts` (punto de entrada real de `migrate.ts` y de la CLI de TypeORM) antes de `loadEnv`. El entorno del proceso siempre gana sobre el archivo, así que staging y los contenedores no cambian. Las pruebas existentes no lo detectaron porque todas inyectaban el entorno a mano (arnés de integración, `loadEnv(schema, source)`, subprocesos con `env:` explícito): ninguna arrancaba el sistema como lo indica el README. Se agrega esa prueba (`test/int/shared/dotenv-bootstrap.int-spec.ts`: proceso real con entorno limpio → `health/live` 200) y las dos de `config.invalid` pasan a forzar un valor **inválido** en vez de una variable ausente | Onboarding roto (CA-1) | developer |
| 2026-09-22 | **Correcciones de revisión del PR-2** (revisión independiente, veredicto Aprobar sin bloqueantes): `PING_QUEUE`/`PingQueue`/`PingJobData` pasan a la fachada `shared/index.ts` porque las dos raíces de composición registran la cola y el lint de fronteras (T-28) habría fallado con el import por ruta; la sonda de Postgres aplica `SET LOCAL statement_timeout = READY_TIMEOUT_MS` en una transacción revertida para no retener una conexión del pool tras el `down`; el cliente efímero de Redis registra oyente de `error` (ioredis no lanza el evento sin oyentes: hace `console.error` con el `stack`, que esquiva Pino y volcaría `REDIS_URL` con credencial) y `check()` devuelve `down` en vez de propagar; `DATABASE_URL` y `REDIS_URL` entran en `REDACTED_FIELDS`; el worker instala `CorrelationIdMiddleware` (no `VersionHeaderMiddleware`: su salud no es API pública, CA-23); se fijan las etiquetas de MinIO, `mc` y ONLYOFFICE, que resolvían a `latest` | Frontera de módulos (Art. VIII), retención de conexiones, prohibición dura de credenciales en bitácoras, RNF-17 y paridad de ambientes (RNF-12) | Adrián + developer |
| 2026-09-22 | Calendario de §9b: PR-3 «CI», PR-4 «imágenes» y PR-5 «staging» (y la compuerta §9a que condiciona el PR-3) pasan a la primera semana de Fase 2. No cambia diseño, contratos ni tareas; solo su fecha. Ver `docs/sdd/workflow.md` §7.2 | Calendario de la Fase 1 | Adrián |
| 2026-09-26 | Calendario de §9b: PR-3 «CI», PR-4 «imágenes» y PR-5 «staging» (y la compuerta §9a) se implementan desde el 30/09/2026, fecha de la entrega de Fase 1. T-33 usa dos rulesets para permitir la autoaprobación permanente del diseñador principal sin saltarse los checks. Ver `docs/sdd/workflow.md` §7 | Decisión del diseñador principal | Adrián |
