# Verificación 000 — Fundaciones (PR-2 «shared»)

| Campo | Valor |
|---|---|
| Fecha | 2026-09-22 |
| Commit | rama `fix/000-carga-de-env` (bloque 2 T-11…T-26 + carga del `.env` + correcciones de revisión) |
| Veredicto | Pendiente del `tester` (este archivo registra la evidencia del developer al cerrar el PR-2; PR-3…PR-5 agregan CA-24…CA-32) |

## Criterios de aceptación

| CA | Prueba(s) | Nivel | Estado |
|---|---|---|---|
| CA-1 | Arranque desde cero cronometrado (abajo) | manual | ✅ 42 s |
| CA-2 | `docker compose config --services` sin perfil = `minio minio-init postgres redis traefik mailpit` (T-09) | manual | ✅ (T-09) |
| CA-3 | `docs/operations/ambientes.md` §3 (T-25); `compose.staging.yml` llega en PR-5 | revisión | ◐ parcial |
| CA-4 | `scripts/repo-structure.spec.ts` | unit | ✅ |
| CA-9 | `pnpm lint && pnpm typecheck` | ci-check | ✅ local |
| CA-10 | `apps/api/src/shared/infrastructure/persistence/data-source.spec.ts` | unit | ✅ |
| CA-11 | `pnpm --filter api migration:run` → `pg_extension` 1 fila, `migracion` 1 fila; `revert` → 0/0; `run` → 1/1 (T-15, Postgres del compose) | manual | ✅ (job de CI en PR-3) |
| CA-12 | Ensayo de PR con `down` vacío | ci-check | ⏳ PR-3 |
| CA-13 | `apps/api/test/int/shared/correlation-id.int-spec.ts` (4) + unitarias de `correlation/` | int + unit | ✅ |
| CA-14 | `apps/api/test/int/shared/ping-queue.int-spec.ts` (2) + `enqueue-with-correlation.spec.ts` | int + unit | ✅ |
| CA-15 | `apps/api/src/shared/infrastructure/logging/redact-deep.spec.ts` (12, incluye URLs de conexión), `logger.options.spec.ts` (9) | unit | ✅ |
| CA-16 | `apps/api/test/int/shared/domain-exception-filter.int-spec.ts` (9) + `errors/domain-error.spec.ts` | int + unit | ✅ |
| CA-17 | `apps/api/src/shared/index.spec.ts` (13, lista exacta del plan §6.2 activa) | unit | ✅ |
| CA-18 | `load-env.spec.ts` (12), `env.module.spec.ts` (3), `minio-config.module.spec.ts` (1); `test/int/shared/bootstrap.int-spec.ts`, `test/int/worker/bootstrap.int-spec.ts`; `apps/web/src/env.spec.ts` | unit + int | ✅ |
| CA-19 | `scripts/check-env-example.spec.ts` (4) + `pnpm env:check` | unit + ci-check | ✅ local (paso de CI en PR-3) |
| CA-20 | `apps/api/test/int/shared/health.int-spec.ts › live con las tres dependencias detenidas` | int | ✅ (404 ms de prueba, respuesta < 100 ms) |
| CA-21 | `health.int-spec.ts › 200 exacto en < 2 s`; sondas con límite propio (`postgres.health-indicator.spec.ts`, `redis.health-indicator.spec.ts`) | int + unit | ✅ (71 ms) |
| CA-22 | `health.int-spec.ts › Redis detenido → 503 en < 3 s sin topología` | int | ✅ (312 ms) |
| CA-23 | `apps/api/test/int/worker/worker-health.int-spec.ts` (3): `ready` 200/503 y `healthcheck.ts` 0/1; `docker inspect` del `HEALTHCHECK` en PR-4 | int + manual | ✅ / ⏳ PR-4 |
| CA-24 | `pnpm test:int` (Testcontainers) y `pnpm test:isolation` reales; jobs en PR-3 | ci-check | ◐ suites listas |
| CA-25 | `apps/api/test/isolation/placeholder.iso-spec.ts`: `ISOLATION_FORCE_FAIL=1` → falla (verificado local) | ci-check | ◐ ensayo en PR-3 |
| CA-33 | `apps/web/src/app/page.spec.tsx`; «API: disponible» en `http://localhost/` (abajo) | unit + manual | ✅ |

## Requisitos no funcionales

| RNF | Evidencia | Estado |
|---|---|---|
| RNF-12 | CA-1 desde cero en 42 s; `config.invalid` + exit 1 sin `DATABASE_URL`/`REDIS_URL` | ✅ |
| RNF-17 | `correlationId` en `api.started`, `worker.started`, `http.request`, `job.*`; redacción en cualquier nivel | ✅ |
| RNF-18 | `live` < 100 ms con dependencias caídas; `ready` < 2 s | ✅ |

## Suites ejecutadas (2026-09-22, Docker Desktop encendido)

| Suite | Resultado | Cobertura |
|---|---|---|
| lint / typecheck | `eslint . --max-warnings 0 && prettier --check .` ✅ · 5 proyectos `tsc` ✅ | — |
| unit | raíz 25 ✅ · contracts 12 ✅ · web 9 ✅ · api 104 ✅ (0 `todo`) | `shared/domain` 100 %, `shared/application` 100 %, `shared/**` 68.6 % líneas (unit) |
| int | 8 suites, 26 pruebas ✅ (contenedores `pgvector/pgvector:pg17`, `redis:7-alpine`, `quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z`) | — |
| isolation | 1 marcador ✅; con `ISOLATION_FORCE_FAIL=1` → ❌ como exige CA-25 | — |
| env:check | «.env.example cubre los esquemas de api, worker y web» ✅ | — |

## CA-1 — arranque desde cero (cronometrado)

Máquina: Windows 11, Docker Desktop, Node 22.23.2, pnpm 10.33.0; imágenes ya en caché local
(sin caché sumar la descarga). Comandos exactos de `README.md`:

```
docker compose down -v                         # punto de partida: sin volúmenes
pnpm install --frozen-lockfile                 #  2 s
cp .env.example .env
docker compose up -d                           #  7 s (postgres, redis, minio, minio-init, traefik, mailpit sanos)
pnpm --filter api migration:run                #  2 s → {"event":"migration.run","applied":["CrearExtensionVector20260915120000"]}
pnpm dev                                       # api 3000 + worker 3001 + web 3002
```

Total hasta `ready` = 200 y página «API: disponible»: **42 s**. Salidas:

```
GET http://localhost/api/v1/health/ready  (vía Traefik)
HTTP/1.1 200 OK
X-Correlation-Id: f14a7479-6d24-4b65-b513-b0c45f194b80
X-Nimbo-Version: dev
{"status":"ok","checks":{"postgres":"up","redis":"up","minio":"up"}}

GET http://localhost/                      → «API: disponible»
GET http://localhost:3001/health/ready     → {"status":"ok","checks":{"redis":"up"}}

bitácoras:
{"correlationId":"3c7b169b-…","event":"api.started","port":3000,"appEnv":"local","version":"dev"}
{"correlationId":"a20b1799-…","event":"worker.started","appEnv":"local","version":"dev","queues":["ping"]}
```

## Hallazgos

- **[F-1]** Docker Hub dejó de servir `minio/minio` y `minio/mc` («pull access denied»); `compose.yml` y el arnés usan
  `quay.io/minio/*` (commit `57ba048`). Plan §6.5 y tasks T-17 mencionan `minio/minio`: precisión, no desviación.
- **[F-2]** El autofix de `consistent-type-imports` convertía importaciones usadas en constructores decorados a
  `import type` y rompía la inyección de Nest; `eslint/nest.js` declara ahora `emitDecoratorMetadata` (commit `a91ea19`).

## Criterios sin prueba automatizable

CA-1 y CA-33 (manual) verificados arriba. CA-2/CA-3 dependen de `compose.staging.yml` (PR-5). CA-11/CA-12/CA-24/CA-25
se completan con los jobs del PR-3 «CI»; las suites que esos jobs ejecutan ya existen y pasan en local.

## Correcciones de revisión (2026-09-22)

Una revisión independiente sobre `main..fix/000-carga-de-env` dio veredicto **Aprobar** sin bloqueantes.
Se verificaron los diez hallazgos contra el código y se aplicaron los accionables:

| # | Hallazgo | Qué se hizo |
|---|---|---|
| I-3 | `app.module.ts` y `worker.module.ts` importaban `shared/infrastructure/queue/ping.queue` por ruta, lo que habría hecho fallar el lint de fronteras (T-28) | `PING_QUEUE`, `PingQueue` y `PingJobData` se reexportan desde `shared/index.ts`: las dos raíces de composición registran la cola, así que el productor es API pública del módulo |
| I-4 | La sonda de Postgres corría `SELECT 1` sin límite: `ready` respondía `down` a los 1,5 s pero la consulta seguía ocupando una conexión del pool | `SET LOCAL statement_timeout = READY_TIMEOUT_MS` dentro de una transacción que siempre se revierte |
| S-1 | El cliente efímero de Redis no registraba oyente de `error`. **Corrección al hallazgo**: ioredis no tumba el proceso (usa `silentEmit`), pero hace `console.error(..., error.stack)`, que esquiva Pino y volcaría `REDIS_URL` con su credencial | Oyente `error` que traga el evento; `check()` devuelve `down` en vez de propagar |
| S-2 | `DATABASE_URL` y `REDIS_URL` llevan credencial embebida y no estaban en `REDACTED_FIELDS` | Añadidas. Queda documentada la limitación: la redacción es por nombre de campo y no alcanza una URL incrustada en un mensaje o `stack` |
| S-3 | El worker no instalaba `CorrelationIdMiddleware`: una petición a su `/health/ready` no abría contexto | Instalado. `VersionHeaderMiddleware` **no**: `x-nimbo-version` es contrato de la API pública y la salud del worker no lo es (CA-23) |
| S-4 | `quay.io/minio/minio`, `quay.io/minio/mc` y `onlyoffice/documentserver` sin etiqueta (resolvían a `latest`) | Fijadas a `RELEASE.2025-09-07T16-13-09Z`, `RELEASE.2025-08-13T08-35-41Z` y `9.3.1`; también en `test/int/setup/containers.ts` |

Sin acción: **I-5** (el PR no tiene checks de CI; llegan en el PR-3, plan §9b) y **S-5** (conflicto previsto en
`specs/README.md` al fusionar con `feat/000b-sistema-de-diseno`; se resuelve en el merge).

Nota sobre CA-1: la medición de 42 s es del 2026-09-18 y **no** se volvió a cronometrar tras estos cambios.
El arranque sí se verificó de punta a punta el 2026-09-21 siguiendo el README (`migration:run`, `health/live`
y `health/ready` en 200, también a través de Traefik).
